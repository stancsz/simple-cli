import sys
import json
import any_llm
import os

def main():
    try:
        # Read from stdin
        input_data = sys.stdin.read()
        if not input_data:
            return

        request = json.loads(input_data)

        provider = request.get("provider")
        model = request.get("model")
        messages = request.get("messages")
        api_key = request.get("api_key")
        temperature = request.get("temperature")
        max_tokens = request.get("maxTokens")

        # Map environment variables if api_key is missing
        if not api_key:
            if provider == 'openai':
                api_key = os.environ.get('OPENAI_API_KEY')
            elif provider == 'anthropic':
                api_key = os.environ.get('ANTHROPIC_API_KEY')
            elif provider in ['google', 'gemini']:
                api_key = os.environ.get('GOOGLE_API_KEY') or os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_GENERATIVE_AI_API_KEY')

        kwargs = {
            "model": model,
            "provider": provider,
            "messages": messages,
            "api_key": api_key
        }

        if temperature is not None:
            kwargs["temperature"] = temperature
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens

        # Call any_llm
        response = any_llm.completion(**kwargs)

        # Extract content
        content = response.choices[0].message.content

        print(json.dumps({"content": content}))

    except Exception as e:
        # Return error as JSON
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
