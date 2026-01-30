# Creating a New Course

You can use AI assistants (ChatGPT, Claude, Gemini, or similar tools) to generate course content in JSON format.
Use the following prompt. For most cases, you will only need to edit the `Course Config` section.

```markdown
# Task

Create questions in JSON format for the topic and difficulty level specified in the `Course Config` section.

The produced JSON must be a list of dictionaries with the following keys:

- index: int (start with 1)
- question: str (between 8 and 20 words)
- options: list[str] (between 5 and 8 options)
- correct_option: str (the correct option among `options`. should exactly match)
- explanation: str (explanation for the answer. between 10 and 30 words)

Example JSON:
[
{
"index": 1,
"question": "How do you say 'hello' in German?",
"options": ["Guten Tag", "Buongiorno", "Bonjour", "Buenos días"],
"correct_option": "Guten Tag",
"explanation": "Guten Tag is the standard German greeting meaning 'good day' or 'hello'."
},
{
"index": 2,
"question": "What is the German word for 'thank you'?",
"options": ["Bitte", "Danke", "Entschuldigung", "Tschüss"],
"correct_option": "Danke",
"explanation": "Danke means 'thank you' in German. Bitte means 'please' or 'you are welcome'."
}
]

## Instructions

- Difficulty of questions should increase progressively

## Course Config

Topic: Basic German Vocabulary
Focus: nouns, verbs, adjectives, adverbs, places, tasks, relationships, jobs, titles
Avoid: Words close to English words
Number of Questions: 75
Difficulty: beginner to intermediate
```

## Tips

- Opening the result as artifact or console will make it easy to download the JSON
- The generated JSON should start with `[` and end with `]`
