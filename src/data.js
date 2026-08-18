export const MODELS = [
  ['Qwen/Qwen3.8-27B', '262k', 'Q8_K_M', 'q8_0', 'native', '61.4', 'Day-0', 'LIVE'],
  ['nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B', '1m', 'NVFP4', 'q8_0', 'native', '148.9', 'MoE A3B', 'LIVE'],
  ['Kwaipilot/KAT-Coder-V2.5-Dev', '262k', 'Q8_K_M', 'q8_0', 'native', '57.2', 'FIM', 'LIVE'],
  ['qwen/qwen3.6-35b-a3b', '262k', 'Q8_K_M', 'q8_0', 'native', '136.0', 'MoE A3B', 'LIVE'],
  ['qwen/qwen3.6-27b', '131k', 'Q8_K_M', 'q8_0', 'native', '64.8', 'stable', 'LIVE'],
]

export const MODEL_DETAILS = [
  'prefill 9.2k t/s · chatml-v3 · quanted 2026-02-18 · cache sha1(system_prompt)',
  'prefill 14.8k t/s · nemotron-v2 · quanted 2026-02-22 · 1,048,576 max tok · nvfp4 on-chip',
  'prefill 8.9k t/s · fim-v1 · quanted 2026-02-19 · fill-in-middle native · fim_prefix/suffix',
  'prefill 12.1k t/s · chatml-v3.1 · quanted 2026-02-21 · 3b active params · moe sparse',
  'prefill 9.8k t/s · chatml-v3.1 · quanted 2026-02-14 · cache sha1(system_prompt)',
]

export const INFRA = [
  {
    title: 'Custom llama.cpp build',
    body: 'Compiled with __GGML_CUDA_FA_ALL_QUANTS=1__. Flash Attention paths exist for every quant we serve, not just the two the default build bothers with. No silent fallback to the slow kernel.',
  },
  {
    title: 'Native Q8 KV-cache',
    body: 'K and V both at __q8_0__. Not fp16-pretending. Measured against fp16 baseline on long-context recall before rollout. Delta was inside noise.',
  },
  {
    title: '1M tokens. No OOM.',
    body: 'Full advertised context window. You can fill it. Nobody quietly truncates at 32k and returns a confident hallucination about the file you pasted.',
  },
  {
    title: 'Routing layer',
    body: 'Prefix-aware. Requests sharing a system prompt land on the same slot, so the cache survives. Aggregator traffic gets sticky affinity by key hash.',
  },
  {
    title: 'Zero cold starts',
    body: 'Weights stay resident. There is no "warming up" state. First request of the day looks like the ten-thousandth.',
  },
  {
    title: 'Grammar-constrained tools',
    body: 'GBNF compiled from your JSON schema at request time. Tool call arguments parse. Every time. No retry loop wrapped around `JSON.parse`.',
  },
]

export const EDGES = ['iad-02', 'fra-01', 'sjc-03', 'ams-01']

export const TERM_LINES = [
  `> POST /v1/chat/completions  model=Qwen/Qwen3.8-27B  stream=true`,
  `> tools=[get_incident, run_query]  tool_choice=auto  max_tokens=2048`,
  ``,
  `data: {"id":"gen-1772041188-Xq7bK2wLpA","provider":"Apex","model":"Qwen/Qwen3.8-27B","object":"chat.completion.chunk","created":1772041188,"choices":[{"index":0,"delta":{"role":"assistant","content":"","tool_calls":[{"index":0,"id":"call_9fda21c4","type":"function","function":{"name":"run_query","arguments":""}}]},"finish_reason":null,"native_finish_reason":null,"logprobs":null}]}`,
  ``,
  `data: {"id":"gen-1772041188-Xq7bK2wLpA","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"sql\\":"}}]},"finish_reason":null}]}`,
  `data: {"id":"gen-1772041188-Xq7bK2wLpA","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"select model_id, p99_ttft"}}]},"finish_reason":null}]}`,
  `data: {"id":"gen-1772041188-Xq7bK2wLpA","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" from edge_latency where"}}]},"finish_reason":null}]}`,
  `data: {"id":"gen-1772041188-Xq7bK2wLpA","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" ts > now() - interval '15m'\\","}}]},"finish_reason":null}]}`,
  `data: {"id":"gen-1772041188-Xq7bK2wLpA","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"limit\\":50}"}}]},"finish_reason":null}]}`,
  ``,
  `data: {"id":"gen-1772041188-Xq7bK2wLpA","provider":"Apex","model":"Qwen/Qwen3.8-27B","object":"chat.completion.chunk","created":1772041188,"choices":[{"index":0,"delta":{"content":""},"finish_reason":"tool_calls","native_finish_reason":"tool_calls"}],"usage":{"prompt_tokens":184302,"completion_tokens":57,"total_tokens":184359,"prompt_tokens_details":{"cached_tokens":162184,"cache_read_input_tokens":162184,"cache_write_input_tokens":22118,"audio_tokens":0},"completion_tokens_details":{"reasoning_tokens":0},"cost":0.0413,"is_byok":false}}`,
  ``,
  `data: [DONE]`,
  ``,
  `# apex-metrics (x-apex-* response headers)`,
  `  x-apex-ttft-ms .................. 118`,
  `  x-apex-itl-ms-p50 ............... 14.2`,
  `  x-apex-itl-ms-p99 ............... 31.7`,
  `  x-apex-tokens-per-sec ........... 70.4`,
  `  x-apex-prefill-tok-per-sec ...... 9184`,
  `  x-apex-cache-hit-ratio .......... 0.880`,
  `  x-apex-kv-cache-type ............ q8_0 / q8_0`,
  `  x-apex-flash-attn ............... 1  (all_quants)`,
  `  x-apex-ctx-used ................. 184302 / 262144`,
  `  x-apex-queue-depth .............. 0`,
  `  x-apex-cold-start ............... false`,
  `  x-apex-grammar .................. gbnf:tool_call.v3`,
  `  x-apex-retention ................ none`,
  ``,
  `$ `,
]

export const MACHINE_DUMP = `>> init apex-inference :: bypass marketing layers :: dumping raw state
>> ts=2026-02-25t18:39:48z node=iad-02 pid=4417 build=apex/llamacpp-b7719-fa-allquants

[endpoints]
  post  /v1/chat/completions        sse=true  tools=true  json_schema=true
  post  /v1/completions             sse=true
  post  /v1/embeddings              batch<=512
  get   /v1/models                  cache-control: max-age=60
  get   /v1/key                     -> {limit,usage,rate_limit,concurrency}
  get   /healthz                    -> 200 "ok" (no body parsing, dont scrape it)
  base_url=https://api.apex-inference.xyz/v1
  auth: authorization: bearer sk-apex-...  (no cookies, no oauth, no dashboard sso)

[build_flags]
  GGML_CUDA_FA_ALL_QUANTS=1
  GGML_CUDA=1
  LLAMA_SERVER_SSL=0            # tls terminated upstream
  cont_batching=1
  flash_attn=on
  cache_type_k=q8_0
  cache_type_v=q8_0
  n_ctx=1048576
  n_parallel=16
  slot_save_path=/dev/null
  defrag_thold=0.10
  grammar_engine=gbnf            # tool args are constrained, not hoped for

[loaded_models]
  qwen/qwen3.8-27b                              ctx=262144   quant=q8_k_m  tps=61.4   tag=day0
  nvidia/nvidia-nemotron-3.5-lightning-30b-a3b  ctx=1048576  quant=nvfp4   tps=148.9  tag=moe_a3b
  kwaipilot/kat-coder-v2.5-dev                  ctx=262144   quant=q8_k_m  tps=57.2   tag=fim
  qwen/qwen3.6-35b-a3b                          ctx=262144   quant=q8_k_m  tps=136.0  tag=moe_a3b
  qwen/qwen3.6-27b                              ctx=131072   quant=q8_k_m  tps=64.8   tag=stable
  # ids are verbatim upstream. we do not normalize them. dont file a bug.

[latency]
  ttft_ms p50=118  p90=204  p99=389
  itl_ms  p50=14.2 p90=22.8 p99=31.7
  prefill_tok_s=9184
  queue_depth=0
  cold_starts_24h=0
  cache_hit_ratio=0.88
  kv_reuse_window=1800s
  router=prefix_affinity(hash=key_id+system_prompt_sha1)

[usage_block_shape]
  {"usage":{"prompt_tokens":184302,"completion_tokens":57,"total_tokens":184359,
   "prompt_tokens_details":{"cached_tokens":162184,"cache_read_input_tokens":162184,
   "cache_write_input_tokens":22118},"cost":0.0413,"is_byok":false}}
  # cache_read is billed at 0.1x. yes it is real. send the same system prompt and watch.

[retention]
  log_prompts=false
  log_completions=false
  retention_seconds=0
  train_on_user_data=false
  persisted_fields=[ts, key_id, model_id, prompt_tokens, completion_tokens, status]
  everything_else -> /dev/null

[day0]
  watcher=hf_firehose
  median_time_to_serve=5h41m
  chat_template_patches_shipped=9
  policy: quant -> eval -> template sanity -> live. if the template is broken on
  release we patch locally and note it. we do not serve a model that cant stop.

[limits_default]
  rpm=600 tpm=2_000_000 max_concurrency=8 max_ctx=1048576
  429 returns retry-after. respect it or you get a longer one.

[observer_control_plane]
  transport=shared_array_buffer+atomics
  frame_words=12 ring_frames=256 commit=sequence_lock
  worker_sleep=atomics.wait(33ms)
  replay_window=8.4s crc=xor32
  tab_mesh=broadcast_channel election=lowest_tab_id
  fallback=message_port
  # react mounts the aperture. frames do not enter component state.

[if aggregator]
  ping admin@apex-inference.xyz with: expected_rps, ctx_distribution,
  needs_isolated_concurrency(bool), billing_entity.
  reply contains api_key, max_concurrency, price_per_mtok. no call scheduled.

[errors]
  400 bad_request        malformed messages[] or unparseable tool schema
  401 no_key
  402 insufficient_credit
  413 context_overflow   you sent > n_ctx. we truncate nothing. we tell you.
  429 rate_limited
  503 model_reloading    <30s, only during a quant swap

>> no telemetry beacon on this page. no analytics. this dump is the whole product page.
>> end stream.`
