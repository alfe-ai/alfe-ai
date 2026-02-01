Place files in /opt/litellm 

https://chatgpt.com/c/697f7707-9164-832e-83b4-7599ad9f2bdf

3) Test fallback works (force it)

LiteLLM supports forcing fallbacks by sending mock_testing_fallbacks: true in the request body.

MASTER=$(grep '^LITELLM_MASTER_KEY=' .env | cut -d= -f2)

curl -sS http://127.0.0.1:4000/v1/chat/completions \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $MASTER" \
-d '{
"model": "glm-4.5-air",
"messages": [{"role":"user","content":"ping"}],
"mock_testing_fallbacks": true
}' | head -c 1000 && echo