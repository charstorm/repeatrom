# Creating a New Course

You can use AI assistants (ChatGPT, Claude, Gemini, or similar tools) to generate course content in JSON format.

## Required JSON Structure

Your course data should be a valid JSON array containing question objects with these fields:

```json
[
  {
    "question": "What is the capital of France?",
    "options": ["Paris", "London", "Berlin", "Madrid"],
    "correct_option": "Paris",
    "explanation": "Paris is the capital and most populous city of France."
  },
  {
    "question": "Which planet is known as the Red Planet?",
    "options": ["Venus", "Mars", "Jupiter", "Saturn"],
    "correct_option": "Mars",
    "explanation": "Mars is called the Red Planet because of the iron oxide on its surface."
  }
]
```

## Design Guidelines

- **Progression**: Questions should start simple and gradually increase in complexity
- **Structure**: The JSON must begin with `[` and end with `]`
- **Optional fields**: Fields like `"index"` are permitted but will be ignored by the system

## How to Generate Content

1. Use the sample prompt below with your AI assistant
2. Open the generated content in an artifact or canvas
3. Download as JSON or copy the raw JSON data to a file

## Sample Prompt

```
Create a comprehensive German language course with 80 multiple-choice questions,
progressing from beginner to intermediate level.

Requirements:
- Focus on everyday vocabulary and common phrases
- Start with basic greetings and numbers, then advance to conversational topics
- Include a mix of vocabulary, grammar, and practical usage questions
- Questions should build upon previous concepts

Output the course as valid JSON in an artifact with this structure:

[
  {
    "question": "How do you say 'hello' in German?",
    "options": ["Guten Tag", "Buongiorno", "Bonjour", "Buenos días"],
    "correct_option": "Guten Tag",
    "explanation": "Guten Tag is the standard German greeting meaning 'good day' or 'hello'."
  },
  {
    "question": "What is the German word for 'thank you'?",
    "options": ["Bitte", "Danke", "Entschuldigung", "Tschüss"],
    "correct_option": "Danke",
    "explanation": "Danke means 'thank you' in German. Bitte means 'please' or 'you're welcome'."
  }
]

Each question object must include:
- question: The question text (string)
- options: Four answer choices (array of strings)
- correct_option: The correct answer matching one option exactly (string)
- explanation: Why this answer is correct (string)
```

---

**Note**: Ensure your JSON is properly formatted before importing it into the course system.
