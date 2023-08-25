# llmail

🤖 LLM + ✉️ email = 🔥 llmail

A bunch of experiments for running local LLM-s to label incoming emails.

## Setup

1. `conda create -n llmail python=3.11`
2. `pip install -r requirements.txt`
3. [Create an app password for your gmail account](https://support.google.com/mail/answer/185833?hl=en)
4. `cp .env.exammple .env`

## Run

You can try work in progress notebooks in the [`experiments`]('./llmail/experiments') folder.

## Looking for 🔎

I am looking to reduce llama 2 CPU latency as much as possible. Let me know if you have a good solution. I am exploring [FHE/MPC](https://github.com/secretflow/spu/blob/main/examples/python/ml/flax_gpt2/flax_gpt2.py), [Speculative sampling](https://github.com/feifeibear/LLMSpeculativeSampling) and [MoE](https://github.com/XueFuzhao/OpenMoE) ATM.
