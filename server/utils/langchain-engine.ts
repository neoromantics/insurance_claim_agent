import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { getDb } from '../db/index'
import {
  findPolicyholderByName, findPolicyholderByPolicy, findClaimById, verifyPII, findClaimsByHints
} from './data'
import type { SessionState } from './types'
import { addMessage, transitionPhase } from './session'

const REQUIRED_VERIFIED_FIELDS = 3;

// =============================================================================
// LangChain Tools Definition
// =============================================================================

function createAgentTools(session: SessionState, controller: ReadableStreamDefaultController) {
  const updateMemory = tool(
    async (args) => {
      if (args.intent_hints?.length) {
        const newHints = args.intent_hints.filter(h => !session.memory.intentHints.includes(h));
        session.memory.intentHints.push(...newHints);
      }
      if (args.case_hints?.length) {
        const newHints = args.case_hints.filter(h => !session.memory.caseHints.includes(h));
        session.memory.caseHints.push(...newHints);
      }
      if (args.user_emotion) session.memory.emotionalState = args.user_emotion;
      if (args.is_out_of_scope) session.memory.outOfScopeAttempts++;
      if (args.escalate_to_human) session.escalatedToHuman = true;
      return `Memory updated. Current out-of-scope attempts: ${session.memory.outOfScopeAttempts}. Emotion: ${session.memory.emotionalState}.`;
    },
    {
      name: "update_memory",
      description: "Store intent/case hints from user messages, track their emotional state, or flag if they ask out-of-scope/irrelevant questions. You can call this alongside other tools.",
      schema: z.object({
        intent_hints: z.array(z.string()).optional(),
        case_hints: z.array(z.string()).optional(),
        user_emotion: z.enum(['neutral', 'frustrated', 'angry', 'confused']).optional(),
        is_out_of_scope: z.boolean().optional(),
        escalate_to_human: z.boolean().optional()
      })
    }
  );

  const submitPii = tool(
    async (args) => {
      for (const [k, v] of Object.entries(args)) {
        if (v && !(session.collectedPII as any)[k]) {
          (session.collectedPII as any)[k] = v;
        }
      }

      let ph = session.matchedPolicyholder;
      if (!ph && session.collectedPII.name) ph = findPolicyholderByName(session.collectedPII.name);
      if (!ph && session.collectedPII.policy_number) ph = findPolicyholderByPolicy(session.collectedPII.policy_number);

      if (ph) {
        session.matchedPolicyholder = ph;
        const { matchedFields } = verifyPII(session.collectedPII as any, ph);
        session.verifiedFieldCount = matchedFields.length;
        
        if (matchedFields.length >= REQUIRED_VERIFIED_FIELDS) {
          session.verificationStatus = 'verified';
          transitionPhase(session.sessionId, 'RESOLVE_INTENT');
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ phase_transition: 'RESOLVE_INTENT' })}\n\n`));
          return `Success: Identity verified. Phase is now RESOLVE_INTENT. You can now safely discuss claims.`;
        }
        return `Found record, but only ${matchedFields.length}/${REQUIRED_VERIFIED_FIELDS} verified. Ask for more PII.`;
      }
      return `No record found. Ask caller to try different details.`;
    },
    {
      name: "submit_pii",
      description: "Submit extracted user PII for verification.",
      schema: z.object({
        name: z.string().optional(),
        dob: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        policy_number: z.string().optional(),
        ssn_last4: z.string().optional()
      })
    }
  );

  const resolveIntent = tool(
    async (args) => {
      if (args.intent) session.resolvedIntent = args.intent;
      if (args.matched_case_id) {
        const claim = findClaimById(args.matched_case_id);
        if (claim) {
          session.resolvedClaim = claim;
          transitionPhase(session.sessionId, 'PROCESS_CASE');
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ phase_transition: 'PROCESS_CASE' })}\n\n`));
          return `Success: Claim loaded. Phase is now PROCESS_CASE. Claim details: ${JSON.stringify(claim)}`;
        }
      }
      return `Intent recorded. Still in RESOLVE_INTENT phase. Ask for case ID if not matched.`;
    },
    {
      name: "resolve_intent",
      description: "Record intent and load a specific claim case ID.",
      schema: z.object({
        intent: z.enum(['status_inquiry', 'denial_question', 'document_submission', 'appeal', 'general_claim_question', 'new_claim']).optional(),
        matched_case_id: z.string().optional()
      })
    }
  );

  const processCaseTools = tool(
    async (args) => {
      if (args.needs_human_review) {
        session.escalatedToHuman = true;
      }
      if (args.case_processed && args.caller_satisfied) {
        session.caseProcessed = true;
        transitionPhase(session.sessionId, 'POST_PROCESS');
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ phase_transition: 'POST_PROCESS' })}\n\n`));
        return `Success: Case processed. Phase is now POST_PROCESS. Offer to send email summary.`;
      }
      return `State updated. Still processing case.`;
    },
    {
      name: "process_case_update",
      description: "Mark case as processed or flag for human review.",
      schema: z.object({
        case_processed: z.boolean(),
        caller_satisfied: z.boolean(),
        needs_human_review: z.boolean().optional()
      })
    }
  );

  const postProcessTools = tool(
    async (args) => {
      if (args.email_offered) session.emailOffered = true;
      if (args.email_sent) session.emailSent = true;
      return `Post process updated.`;
    },
    {
      name: "post_process_update",
      description: "Record if email summary was offered or sent.",
      schema: z.object({
        email_offered: z.boolean(),
        email_sent: z.boolean()
      })
    }
  );

  return { updateMemory, submitPii, resolveIntent, processCaseTools, postProcessTools };
}

// =============================================================================
// Prompts
// =============================================================================

function systemPromptFor(s: SessionState): string {
  const base = `You are a conversational insurance claims agent.
Rules:
1. TONE & EMOTION: Warm, professional, and empathetic. If the user is frustrated, angry, or confused, acknowledge it with empathy and de-escalate.
2. SOP RECOVERY: Explain *why* SOP steps (like identity verification) matter to protect their privacy. Persuade them to continue. NEVER bypass required gates.
3. OUT OF SCOPE: Limit answers strictly to insurance. Politely reject out-of-scope questions (e.g. "what is RL?"). Use the update_memory tool to flag is_out_of_scope.
4. SECRECY: NEVER disclose claim details before identity is fully verified.
5. RESPONSIVENESS: NEVER ask the caller to wait (e.g. "One moment please"). Call tools instantly.

Memory Hints: Intent(${s.memory.intentHints.join(',')}) Cases(${s.memory.caseHints.join(',')})
Current Phase: ${s.currentPhase}
`;

  if (s.currentPhase === 'VERIFY_ID') {
    return base + `Goal: Verify identity without leaking claim data. You need 3 matching PII fields (Name, DOB, Phone, Email, SSN last 4, National ID last 4, Policy number).
Currently verified: ${s.verifiedFieldCount}/${REQUIRED_VERIFIED_FIELDS}.
Use submit_pii tool to check extracted data. Use update_memory if the user mentions claim hints so you can remember them for later.`;
  }
  
  if (s.currentPhase === 'RESOLVE_INTENT') {
    const claims = s.matchedPolicyholder ? getDb().prepare('SELECT case_id, case_type, status, created_at FROM claims WHERE party_id = ?').all(s.matchedPolicyholder.party_id) : [];
    return base + `Goal: Pre-match intent and case ID using remembered hints. Available claims: ${JSON.stringify(claims)}.
Use resolve_intent tool. If remembered hints clearly match one claim (e.g., denied healthcare claim), output matched_case_id immediately.`;
  }

  if (s.currentPhase === 'PROCESS_CASE') {
    return base + `Goal: Answer questions using only the loaded claim data. Claim Data: ${JSON.stringify(s.resolvedClaim)}.
When the caller is satisfied, use process_case_update tool.`;
  }

  if (s.currentPhase === 'POST_PROCESS') {
    return base + `Goal: Wrap up and offer to send an email summary of the conversation. Give them the choice. Use post_process_update tool.`;
  }

  return base;
}

// =============================================================================
// Core LangChain Loop
// =============================================================================

export async function processMessageStreamLangChain(
  client: any,
  model: string,
  session: SessionState,
  userMessage: string,
  controller: ReadableStreamDefaultController
): Promise<void> {
  
  addMessage(session.sessionId, 'user', userMessage, session.currentPhase);
  
  const primaryLlm = new ChatOpenAI({
    modelName: model,
    temperature: 0.7,
    apiKey: process.env.OLLAMA_API_KEY || 'dummy',
    openAIApiKey: process.env.OLLAMA_API_KEY || 'dummy',
    configuration: {
      baseURL: process.env.OLLAMA_BASE_URL || 'https://ollama.com/v1'
    }
  });

  // Fallback LLM (Lower temperature for more deterministic outputs if the primary fails)
  const fallbackLlm = new ChatOpenAI({
    modelName: model,
    temperature: 0.1,
    apiKey: process.env.OLLAMA_API_KEY || 'dummy',
    openAIApiKey: process.env.OLLAMA_API_KEY || 'dummy',
    configuration: {
      baseURL: process.env.OLLAMA_BASE_URL || 'https://ollama.com/v1'
    }
  });

  const allTools = createAgentTools(session, controller);
  
  const langchainMessages: any[] = session.conversationHistory.slice(-20).map(m => {
    if (m.role === 'user') return new HumanMessage(m.content);
    if (m.role === 'assistant') return new AIMessage(m.content);
    return new SystemMessage(m.content);
  });

  let loopCount = 0;
  const MAX_LOOPS = 5;

  while (loopCount < MAX_LOOPS) {
    loopCount++;

    if (session.escalatedToHuman || session.memory.outOfScopeAttempts >= 3) {
      if (!session.escalatedToHuman) session.escalatedToHuman = true;
      const transferMsg = "I understand you have concerns outside my ability to assist right now. I'll connect you with a human representative to help you further.";
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ chunk: transferMsg })}\n\n`));
      langchainMessages.push(new AIMessage(transferMsg));
      break;
    }

    // Dynamically bind tools based on phase
    let phaseTools: any[] = [allTools.updateMemory];
    if (session.currentPhase === 'VERIFY_ID') phaseTools.push(allTools.submitPii);
    else if (session.currentPhase === 'RESOLVE_INTENT') phaseTools.push(allTools.resolveIntent);
    else if (session.currentPhase === 'PROCESS_CASE') phaseTools.push(allTools.processCaseTools);
    else if (session.currentPhase === 'POST_PROCESS') phaseTools.push(allTools.postProcessTools);

    const primaryWithTools = primaryLlm.bindTools(phaseTools);
    const fallbackWithTools = fallbackLlm.bindTools(phaseTools);
    const llmWithTools = primaryWithTools.withFallbacks({ fallbacks: [fallbackWithTools] });
    
    const messagesToRun = [new SystemMessage(systemPromptFor(session)), ...langchainMessages];
    
    // Add newline gap for multiple loops visually
    if (loopCount > 1) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ chunk: '\n\n' })}\n\n`));
    }

    const stream = await llmWithTools.stream(messagesToRun);
    let aiMessage: any = null;

    for await (const chunk of stream) {
      if (!aiMessage) {
        aiMessage = chunk;
      } else {
        aiMessage = aiMessage.concat(chunk);
      }
      if (chunk.content) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ chunk: chunk.content })}\n\n`));
      }
    }

    langchainMessages.push(aiMessage);

    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      for (const tc of aiMessage.tool_calls) {
        const toolMatch = phaseTools.find(t => t.name === tc.name);
        if (toolMatch) {
          const result = await toolMatch.invoke(tc.args);
          langchainMessages.push(new ToolMessage({ tool_call_id: tc.id, content: result }));
        }
      }
      continue; // Loop again to process the ToolMessage
    }

    break; // No tool calls, generation is complete
  }

  // Extract final text
  const finalAiMsg = langchainMessages[langchainMessages.length - 1];
  let finalText = "";
  if (finalAiMsg instanceof AIMessage && typeof finalAiMsg.content === 'string') {
    finalText = finalAiMsg.content;
  }

  if (!finalText || finalText.trim() === '') {
    finalText = "I'm looking into that for you. Could you clarify or provide a bit more detail?";
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ chunk: finalText })}\n\n`));
  }

  addMessage(session.sessionId, 'assistant', finalText, session.currentPhase);

  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ 
    done: true,
    sessionId: session.sessionId,
    phase: session.currentPhase,
    verificationStatus: session.verificationStatus,
    metadata: {
      verifiedFields: session.verifiedFieldCount,
      requiredFields: REQUIRED_VERIFIED_FIELDS,
      matchedPolicyholder: session.matchedPolicyholder?.name || null,
      resolvedIntent: session.resolvedIntent,
      resolvedClaim: session.resolvedClaim?.case_id || null,
      emailSent: session.emailSent,
      escalated: session.escalatedToHuman,
    }
  })}\n\n`));
}
