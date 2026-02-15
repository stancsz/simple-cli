import sys
import json
import os

# Check for required packages
try:
    from agno.agent import Agent
    from agno.db.sqlite import SqliteDb
    from agno.models.openai import OpenAIChat
except ImportError:
    print(json.dumps({
        "error": "Missing dependencies. Please install 'agno' (pip install agno)."
    }))
    sys.exit(1)

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python agent.py <user_id> <message> [session_id]"}), file=sys.stderr)
        sys.exit(1)

    user_id = sys.argv[1]
    message = sys.argv[2]
    session_id = sys.argv[3] if len(sys.argv) > 3 else None

    # Ensure .agent directory exists
    agent_dir = os.path.join(os.getcwd(), ".agent")
    os.makedirs(agent_dir, exist_ok=True)
    db_path = os.path.join(agent_dir, "agno.db")

    try:
        # Initialize Agent with persistent memory (storage) and knowledge (learning)
        # Note: 'learning=True' enables long-term memory about the user.
        agent = Agent(
            model=OpenAIChat(id="gpt-4o"),
            storage=SqliteDb(db_file=db_path, table_name="agent_sessions"),
            db=SqliteDb(db_file=db_path, table_name="agent_knowledge"), # For learning/knowledge
            session_id=session_id,
            user_id=user_id,
            read_chat_history=True,   # Remember previous messages in session
            add_history_to_messages=True,
            # learning=True, # Enable if supported by installed version, safer to assume standard memory first
            description="You are a helpful assistant with persistent memory. You remember details about the user.",
            instructions=["Always check your memory for details about the user before answering."]
        )

        # Run agent
        response = agent.run(message)

        # Output the response content
        if hasattr(response, 'content'):
            print(response.content)
        else:
            print(str(response))

    except Exception as e:
        print(json.dumps({"error": f"Execution failed: {str(e)}"}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
