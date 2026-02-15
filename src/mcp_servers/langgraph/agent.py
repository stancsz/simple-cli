import sys
import json
import os
from typing import TypedDict, Annotated, List
from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage
import operator

# Define the state
class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], operator.add]

def call_model(state):
    messages = state['messages']
    # Default to gpt-4o or use environment variable if set
    model_name = os.environ.get("OPENAI_MODEL_NAME", "gpt-4o")
    llm = ChatOpenAI(temperature=0, model=model_name)
    response = llm.invoke(messages)
    return {"messages": [response]}

def main():
    if len(sys.argv) < 2:
        # If no arguments, just exit (could be a check run)
        sys.exit(0)

    task = sys.argv[1]

    if not os.environ.get("OPENAI_API_KEY"):
         print(json.dumps({"error": "OPENAI_API_KEY not set"}))
         sys.exit(1)

    try:
        workflow = StateGraph(AgentState)
        workflow.add_node("agent", call_model)
        workflow.set_entry_point("agent")
        workflow.add_edge("agent", END)

        app = workflow.compile()

        inputs = {"messages": [HumanMessage(content=task)]}
        result = app.invoke(inputs)

        print(json.dumps({"result": result['messages'][-1].content}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
