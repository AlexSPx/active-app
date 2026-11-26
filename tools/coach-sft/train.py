"""Local QLoRA with explicit assistant-only labels and resumable optimizer steps."""
import argparse
import hashlib
import json
import math
import random
from pathlib import Path

from grade import rows, write


def encode(tokenizer, row, max_length):
    history = row["messages"][:-1]
    target = row["messages"][-1]
    assert target["role"] == "assistant" and target["content"]
    prompt = tokenizer.apply_chat_template(history, tokenize=False, add_generation_prompt=True, enable_thinking=False)
    full = tokenizer.apply_chat_template([*history, target], tokenize=False, enable_thinking=False)
    prefix = tokenizer(prompt, add_special_tokens=False).input_ids
    ids = tokenizer(full, add_special_tokens=False).input_ids
    assert ids[:len(prefix)] == prefix and len(ids) > len(prefix), row["id"]
    if len(ids) > max_length:
        return None
    labels = [-100] * len(prefix) + ids[len(prefix):]
    assert all(label == -100 for label in labels[:len(prefix)])
    assert tokenizer.decode([x for x in labels if x != -100]).strip() == target["content"] + "<|im_end|>", row["id"]
    return ids, labels


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("base", type=Path)
    p.add_argument("data", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("--from-adapter", type=Path)
    p.add_argument("--smoke", action="store_true")
    p.add_argument("--lr", type=float, default=1e-4)
    p.add_argument("--length", type=int, default=1536)
    p.add_argument("--epochs", type=int, default=2)
    p.add_argument("--focus-on-answers", action="store_true")
    p.add_argument("--focus-on-followups", action="store_true")
    args = p.parse_args()

    import torch
    from peft import LoraConfig, PeftModel, get_peft_model, get_peft_model_state_dict, set_peft_model_state_dict
    from torch.utils.checkpoint import checkpoint
    from transformers import AutoTokenizer, BitsAndBytesConfig, Qwen3_5ForConditionalGeneration

    seed, batch_size = 3407, 4
    torch.manual_seed(seed)
    rng = random.Random(seed)
    args.output.mkdir(exist_ok=True)
    tokenizer = AutoTokenizer.from_pretrained(args.base, local_files_only=True)
    data = rows(args.data)
    assert len({row["id"] for row in data}) == len(data)
    examples, oversize = [], []
    final_turns = {row["id"].rpartition(":")[0]: row["id"] for row in data}
    intent_index = 0
    for row in data:
        if args.focus_on_answers and '"intent":' in row["messages"][-1]["content"]:
            intent_index += 1
            if intent_index % 5:
                continue
        encoded = encode(tokenizer, row, args.length)
        if encoded:
            examples.append(encoded)
            prior = sum(message["role"] == "assistant" for message in row["messages"][:-1])
            if (args.focus_on_followups and row["group"] == "coaching" and prior >= 3
                    and final_turns.get(row["id"].rpartition(":")[0]) == row["id"]):
                examples.append(encoded)
        else:
            oversize.append(row["id"])
    assert examples
    rng.shuffle(examples)
    batches = [examples[i:i + batch_size] for i in range(0, len(examples), batch_size)]
    batches = [max(batches, key=lambda batch: max(len(x[0]) for x in batch))] if args.smoke else batches * args.epochs
    receipt = {**{k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()},
               "data_sha256": hashlib.sha256(args.data.read_bytes()).hexdigest(),
               "template_sha256": hashlib.sha256(tokenizer.chat_template.encode()).hexdigest(),
               "seed": seed, "batch_size": batch_size, "oversize": oversize,
               "examples": len(examples), "updates": len(batches), "assistant_only_verified": True}
    for option in ("focus_on_answers", "focus_on_followups"):
        if not receipt[option]:
            del receipt[option]
    config = args.output / "config.json"
    if config.exists():
        assert json.loads(config.read_text()) == receipt, "Resume configuration or data changed"
    else:
        write(config, receipt)
    if (args.output / "report.json").exists():
        print((args.output / "report.json").read_text())
        return

    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    base = Qwen3_5ForConditionalGeneration.from_pretrained(
        args.base, local_files_only=True, device_map={"": 0}, dtype=dtype,
        quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                                               bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=dtype),
    )
    base.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    model = (PeftModel.from_pretrained(base, args.from_adapter, is_trainable=True) if args.from_adapter else
             get_peft_model(base, LoraConfig(r=16, lora_alpha=16, target_modules=[
                 "q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"
             ], layers_to_transform=list(range(24)), layers_pattern="layers", bias="none")))
    parameters = [p for p in model.parameters() if p.requires_grad]
    assert parameters and all(p.dtype == torch.float32 for p in parameters)
    optimizer = torch.optim.AdamW(parameters, lr=args.lr)
    state_path = args.output / "state.pt"
    start, losses = 0, []
    if state_path.exists():
        state = torch.load(state_path, weights_only=True)
        set_peft_model_state_dict(model, state["adapter"])
        optimizer.load_state_dict(state["optimizer"])
        torch.set_rng_state(state["rng"])
        torch.cuda.set_rng_state(state["cuda_rng"])
        losses = state["losses"]
        start = len(losses)
        del state

    def loss(example):
        ids, labels = example
        tokens = torch.tensor([ids], device="cuda")
        labels = torch.tensor(labels[1:], device="cuda")
        positions = (labels != -100).nonzero(as_tuple=True)[0]

        def token_loss(hidden, targets):
            return torch.nn.functional.cross_entropy(base.lm_head(hidden).float(), targets, reduction="sum")

        with torch.autocast("cuda", dtype=dtype):
            hidden = base.model(input_ids=tokens, use_cache=False).last_hidden_state[0, positions]
            targets = labels[positions]
            return torch.stack([checkpoint(token_loss, chunk, target, use_reentrant=False)
                                for chunk, target in zip(hidden.split(32), targets.split(32))]).sum() / targets.numel()

    model.train()
    for index in range(start, len(batches)):
        batch = batches[index]
        optimizer.zero_grad(set_to_none=True)
        values = []
        for example in batch:
            value = loss(example)
            values.append(value.item())
            if not math.isfinite(values[-1]):
                raise RuntimeError("Non-finite training loss")
            (value / len(batch)).backward()
        torch.nn.utils.clip_grad_norm_(parameters, 1.0, error_if_nonfinite=True)
        optimizer.step()
        losses.append(sum(values) / len(values))
        if (index + 1) % 4 == 0 or index + 1 == len(batches):
            tmp = state_path.with_suffix(".tmp")
            torch.save(dict(adapter=get_peft_model_state_dict(model), optimizer=optimizer.state_dict(),
                            rng=torch.get_rng_state(), cuda_rng=torch.cuda.get_rng_state(), losses=losses), tmp)
            tmp.replace(state_path)
        print(f"Update {index + 1}/{len(batches)} loss {losses[-1]:.4f}", flush=True)

    assert any(torch.count_nonzero(p).item() for name, p in model.named_parameters() if "lora_B" in name)
    target = args.output / "adapter"
    model.save_pretrained(target)
    tokenizer.save_pretrained(target)
    write(args.output / "report.json", dict(losses=losses, peak_vram_bytes=torch.cuda.max_memory_reserved(),
                                            adapter_sha256=hashlib.sha256((target / "adapter_model.safetensors").read_bytes()).hexdigest()))


if __name__ == "__main__":
    main()
