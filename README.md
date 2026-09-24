# Insurance Claims SOP Agent (LangChain)
An SOP-Guided Conversational Agent for insurance claims support built with Nuxt 3, LangChain, and Ollama.

## Quick Start
1. Create a `.env` file at the root with your API key:
`OLLAMA_API_KEY=your_key_here`

2. Run the project out-of-the-box using Docker:
`docker compose up --build`
*(Alternatively, without Docker: `npm install && npm run dev`)*

Open **http://localhost:3000**. The database seeds automatically on boot.

## Test Scenario
Try the test prompt:
> I'm the policyholder. My name is Margaret Chen, policy POL-9921. I'm calling about my denied healthcare claim from January. DOB is 1985-03-15, SSN last four is 4472.
