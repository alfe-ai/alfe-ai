Perplexity home pagedark logo
Docs
Examples
API Reference

    Playground

Forum
Blog
Changelog
Perplexity API

    POST
    Chat Completions
    POST
    Create Async Chat Completion
    GET
    List Async Chat Completions
    GET
    Get Async Chat Completion Response

Chat Completions
Copy
Ask AI

curl --request POST \
  --url https://api.perplexity.ai/chat/completions \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "sonar",
  "messages": [
    {
      "role": "system",
      "content": "Be precise and concise."
    },
    {
      "role": "user",
      "content": "How many stars are there in our galaxy?"
    }
  ]
}'

{
  "id": "<string>",
  "model": "<string>",
  "created": 123,
  "usage": {
    "prompt_tokens": 123,
    "completion_tokens": 123,
    "total_tokens": 123,
    "search_context_size": "<string>",
    "citation_tokens": 123,
    "num_search_queries": 123,
    "reasoning_tokens": 123
  },
  "object": "chat.completion",
  "choices": [
    {
      "index": 123,
      "finish_reason": "stop",
      "message": {
        "content": "<string>",
        "role": "system"
      }
    }
  ],
  "citations": [
    "<string>"
  ],
  "search_results": [
    {
      "title": "<string>",
      "url": "<string>",
      "date": "2023-12-25"
    }
  ]
}

Perplexity API
Chat Completions

Generates a model’s response for the given chat conversation.
POST
/
chat
/
completions
Authorizations
​
Authorization
string
header
required

Bearer authentication header of the form Bearer <token>, where <token> is your auth token.
Body
application/json
​
model
string
required

The name of the model that will complete your prompt. Refer to Supported Models to find all the models offered.
Example:

"sonar"
​
messages
Message · object[]
required

A list of messages comprising the conversation so far.

Show child attributes
Example:

[
  {
    "role": "system",
    "content": "Be precise and concise."
  },
  {
    "role": "user",
    "content": "How many stars are there in our galaxy?"
  }
]

​
search_mode
enum<string>
default:web

Controls the search mode used for the request. When set to 'academic', results will prioritize scholarly sources like peer-reviewed papers and academic journals. More information about this here.
Available options: academic, 
web 
​
reasoning_effort
enum<string>
default:medium

Controls how much computational effort the AI dedicates to each query for deep research models. 'low' provides faster, simpler answers with reduced token usage, 'medium' offers a balanced approach, and 'high' delivers deeper, more thorough responses with increased token usage. This parameter directly impacts the amount of reasoning tokens consumed. WARNING: This parameter is ONLY applicable for sonar-deep-research.
Available options: low, 
medium, 
high 
​
max_tokens
integer

The maximum number of completion tokens returned by the API. Controls the length of the model's response. If the response would exceed this limit, it will be truncated. Higher values allow for longer responses but may increase processing time and costs.
​
temperature
number
default:0.2

The amount of randomness in the response, valued between 0 and 2. Lower values (e.g., 0.1) make the output more focused, deterministic, and less creative. Higher values (e.g., 1.5) make the output more random and creative. Use lower values for factual/information retrieval tasks and higher values for creative applications.
Required range: 0 <= x < 2
​
top_p
number
default:0.9

The nucleus sampling threshold, valued between 0 and 1. Controls the diversity of generated text by considering only the tokens whose cumulative probability exceeds the top_p value. Lower values (e.g., 0.5) make the output more focused and deterministic, while higher values (e.g., 0.95) allow for more diverse outputs. Often used as an alternative to temperature.
​
search_domain_filter
any[]

A list of domains to limit search results to. Currently limited to 10 domains for Allowlisting and Denylisting. For Denylisting, add a - at the beginning of the domain string. More information about this here.
​
return_images
boolean
default:false

Determines whether search results should include images.
​
return_related_questions
boolean
default:false

Determines whether related questions should be returned.
​
search_recency_filter
string

Filters search results based on time (e.g., 'week', 'day').
​
search_after_date_filter
string

Filters search results to only include content published after this date. Format should be %m/%d/%Y (e.g. 3/1/2025)
​
search_before_date_filter
string

Filters search results to only include content published before this date. Format should be %m/%d/%Y (e.g. 3/1/2025)
​
last_updated_after_filter
string

Filters search results to only include content last updated after this date. Format should be %m/%d/%Y (e.g. 3/1/2025)
​
last_updated_before_filter
string

Filters search results to only include content last updated before this date. Format should be %m/%d/%Y (e.g. 3/1/2025)
​
top_k
number
default:0

The number of tokens to keep for top-k filtering. Limits the model to consider only the k most likely next tokens at each step. Lower values (e.g., 10) make the output more focused and deterministic, while higher values allow for more diverse outputs. A value of 0 disables this filter. Often used in conjunction with top_p to control output randomness.
​
stream
boolean
default:false

Determines whether to stream the response incrementally.
​
presence_penalty
number
default:0

Positive values increase the likelihood of discussing new topics. Applies a penalty to tokens that have already appeared in the text, encouraging the model to talk about new concepts. Values typically range from 0 (no penalty) to 2.0 (strong penalty). Higher values reduce repetition but may lead to more off-topic text.
​
frequency_penalty
number
default:0

Decreases likelihood of repetition based on prior frequency. Applies a penalty to tokens based on how frequently they've appeared in the text so far. Values typically range from 0 (no penalty) to 2.0 (strong penalty). Higher values (e.g., 1.5) reduce repetition of the same words and phrases. Useful for preventing the model from getting stuck in loops.
​
response_format
object

Enables structured JSON output formatting.
​
web_search_options
object

Configuration for using web search in model responses.

Show child attributes
Example:

{ "search_context_size": "high" }

Response
200
application/json

OK
​
id
string
required

A unique identifier for the chat completion.
​
model
string
required

The model that generated the response.
​
created
integer
required

The Unix timestamp (in seconds) of when the chat completion was created.
​
usage
object
required

Show child attributes
​
object
string
default:chat.completion
required

The type of object, which is always chat.completion.
​
choices
ChatCompletionsChoice · object[]
required

A list of chat completion choices. Can be more than one if n is greater than 1.

Show child attributes
​
citations
string[] | null

A list of citation sources for the response.
​
search_results
ApiPublicSearchResult · object[] | null

A list of search results related to the response.

Show child attributes
Create Async Chat Completion
Next
x
discord
website
