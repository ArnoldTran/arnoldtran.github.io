# main.py
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import os
import openai
import random

# Set your OpenAI API key
openai.api_key = os.getenv("OPENAI_API_KEY")

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request model
class ChatRequest(BaseModel):
    message: str

# Map keywords to “AI agent responses”
KEYWORD_RESPONSES = {
    "flood": [
        "SmartStorm AI alerts: Potential flooding detected. I'll notify the crew to monitor affected areas.",
        "Flood risk logged. Crews will be dispatched to high-risk zones.",
        "Warning: Flood-prone sites noted. Scheduling preventive inspections."
    ],
    "tree": [
        "SmartStorm AI: Tree maintenance report logged. I'll schedule the crew to trim or remove hazardous trees.",
        "SmartStorm AI: Maintenance report regarding trees noted."
    ],
    "power": [
        "Power outage reported. Crews will investigate and restore service as soon as possible.",
        "SmartStorm AI: Tracking power issues. Prioritizing critical areas."
    ],
    "road": [
        "Road maintenance request received. I'll add this to the weekly plan.",
        "SmartStorm AI: Inspecting reported road damage and scheduling repairs."
    ],
    "default": [
        "Message received: '{}'. I'll log it and prioritize with the weekly plan.",
        "SmartStorm AI here: Noted '{}'. Assigning appropriate crew action.",
        "Thanks for reporting '{}'. I'll make sure it's addressed promptly."
    ]
}

def simulated_smartstorm_reply(user_message: str) -> str:
    # Lowercase for keyword matching
    msg_lower = user_message.lower()
    
    # Check for keywords
    for keyword, responses in KEYWORD_RESPONSES.items():
        if keyword in msg_lower:
            return random.choice(responses)
    
    # Default reply if no keyword matches
    return random.choice(KEYWORD_RESPONSES["default"]).format(user_message)



@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    user_message = req.message
    try:
        response = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": user_message}],
            max_tokens=150
        )
        reply = response.choices[0].message.content.strip()
    except Exception as e:
        print("OpenAI error:", e)  # Log the error
        # Use context-aware SmartStorm AI fallback
        reply = simulated_smartstorm_reply(user_message)

    return {"reply": reply}

