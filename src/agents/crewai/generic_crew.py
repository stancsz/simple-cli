import sys
import os
from crewai import Agent, Task, Crew, Process

def main():
    if len(sys.argv) < 2:
        print("Usage: python generic_crew.py <task_description>")
        sys.exit(1)

    task_description = sys.argv[1]

    # Ensure API Key is present
    if not os.environ.get("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY environment variable is not set.")
        sys.exit(1)

    print(f"Starting CrewAI with task: {task_description}")

    # Define Agents
    researcher = Agent(
        role='Senior Researcher',
        goal='Uncover detailed information about the topic',
        backstory="""You are a senior researcher with a keen eye for detail.
        You are expert at analyzing complex topics and extracting key insights.""",
        verbose=True,
        allow_delegation=False
    )

    writer = Agent(
        role='Senior Technical Writer',
        goal='Craft compelling content based on research',
        backstory="""You are a renowned technical writer, known for your insightful and engaging articles.
        You transform complex concepts into clear, concise, and accessible content.""",
        verbose=True,
        allow_delegation=False
    )

    # Define Tasks
    research_task = Task(
        description=f"""Conduct a comprehensive analysis of the following task/topic: '{task_description}'.
        Identify key components, potential challenges, and strategic insights.""",
        expected_output="A detailed research report with key findings and insights.",
        agent=researcher
    )

    writing_task = Task(
        description=f"""Using the insights from the research report, write a comprehensive response/solution to the original request: '{task_description}'.
        Ensure the tone is professional and the content is actionable.""",
        expected_output="A final answer or report addressing the user's request.",
        agent=writer
    )

    # Instantiate Crew
    crew = Crew(
        agents=[researcher, writer],
        tasks=[research_task, writing_task],
        process=Process.sequential,
        verbose=True
    )

    # Kickoff
    result = crew.kickoff()

    print("\n\n########################")
    print("## Final Result ##")
    print("########################\n")
    print(result)

if __name__ == "__main__":
    main()
