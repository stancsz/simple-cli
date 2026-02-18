import sys
import json
import os
try:
    import autogen
    from autogen import UserProxyAgent, AssistantAgent
except ImportError:
    # Should not happen if check passed
    sys.exit(1)

def main():
    if len(sys.argv) < 2:
        sys.exit(0)

    task = sys.argv[1]

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print(json.dumps({"error": "OPENAI_API_KEY environment variable not set."}))
        sys.exit(1)

    model_name = os.environ.get("OPENAI_MODEL_NAME", "gpt-4o")
    base_url = os.environ.get("OPENAI_BASE_URL")
    config_entry = {"model": model_name, "api_key": api_key}
    if base_url:
        config_entry["base_url"] = base_url
    
    config_list = [config_entry]

    try:
        assistant = AssistantAgent(
            "assistant",
            llm_config={"config_list": config_list}
        )
        user_proxy = UserProxyAgent(
            "user_proxy",
            code_execution_config={"work_dir": "coding", "use_docker": False},
            human_input_mode="NEVER",
            max_consecutive_auto_reply=1
        )

        # Capture stdout to avoid polluting MCP output if we want clean JSON
        import io
        from contextlib import redirect_stdout

        f = io.StringIO()
        with redirect_stdout(f):
            user_proxy.initiate_chat(assistant, message=task)

        # Get history
        # history is a dict of list of messages
        # We want the conversation with assistant
        history = user_proxy.chat_messages[assistant]

        # Extract the last message content from assistant or user_proxy (whoever spoke last)
        last_msg = history[-1]['content']

        # Also return the full conversation as text
        full_conversation = ""
        for msg in history:
            role = msg.get('role', 'unknown')
            content = msg.get('content', '')
            full_conversation += f"{role}: {content}\n\n"

        print(json.dumps({
            "result": last_msg,
            "conversation": full_conversation
        }))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
