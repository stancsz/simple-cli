import sys
import json
import os
from typing import Dict, Any, Type

# Check for required packages
try:
    from pydantic import create_model, Field, BaseModel
    from pydantic_ai import Agent
except ImportError:
    print(json.dumps({
        "error": "Missing dependencies. Please install 'pydantic-ai' and 'pydantic' (pip install pydantic-ai pydantic)."
    }))
    sys.exit(1)

def create_dynamic_model(schema_def: Dict[str, Any]) -> Type[BaseModel]:
    """
    Creates a Pydantic model dynamically from a simplified schema definition.
    Schema format: { "field_name": { "type": "str|int|float|bool", "description": "..." } }
    """
    fields = {}
    type_map = {
        "str": str,
        "string": str,
        "int": int,
        "integer": int,
        "float": float,
        "number": float,
        "bool": bool,
        "boolean": bool
    }

    for name, info in schema_def.items():
        type_str = info.get("type", "str").lower()
        field_type = type_map.get(type_str, str)
        description = info.get("description", "")

        # We assume all fields are required for this demo
        fields[name] = (field_type, Field(description=description))

    return create_model('DynamicExtraction', **fields)

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python agent.py <prompt> [schema_json]"}), file=sys.stderr)
        sys.exit(1)

    prompt = sys.argv[1]
    schema_arg = sys.argv[2] if len(sys.argv) > 2 else None

    # Default model if no schema provided
    ResultModel = None

    if schema_arg:
        try:
            schema_def = json.loads(schema_arg)
            ResultModel = create_dynamic_model(schema_def)
        except json.JSONDecodeError:
            print(json.dumps({"error": "Invalid JSON schema provided."}), file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(json.dumps({"error": f"Failed to create model: {str(e)}"}), file=sys.stderr)
            sys.exit(1)
    else:
        # Default fallback: General Summary
        class GeneralSummary(BaseModel):
            summary: str = Field(description="A concise summary of the input.")
            keywords: list[str] = Field(description="Key topics or entities extracted.")
        ResultModel = GeneralSummary

    # Initialize Agent
    # Note: pydantic-ai requires an LLM provider.
    # It attempts to infer from environment (e.g. OPENAI_API_KEY).
    # We use a default model 'openai:gpt-4o' but this depends on keys being set.
    try:
        agent = Agent(
            'openai:gpt-4o',
            result_type=ResultModel,
            system_prompt="You are an expert data extractor. specificy extract the data strictly adhering to the requested schema."
        )

        # Run synchronously
        # run_sync might assume an event loop exists or create one.
        result = agent.run_sync(prompt)

        # Output result
        print(result.data.model_dump_json())

    except Exception as e:
        # Handle API errors, missing keys, etc.
        print(json.dumps({"error": f"Execution failed: {str(e)}"}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
