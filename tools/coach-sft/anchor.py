"""Reconstruct the production text weights for QLoRA from their Q8 representation."""
import argparse
import json
import shutil
from pathlib import Path

import gguf
import torch
from safetensors import safe_open
from safetensors.torch import save_file


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("source", type=Path)
    p.add_argument("gguf", type=Path)
    p.add_argument("output", type=Path)
    args = p.parse_args()
    model = gguf.GGUFReader(args.gguf)
    config = json.loads((args.source / "config.json").read_text())["text_config"]
    assert config["linear_num_key_heads"] == config["linear_num_value_heads"]
    mapping = gguf.get_tensor_name_map(gguf.MODEL_ARCH.QWEN35, config["num_hidden_layers"] + 1)
    tensors = {t.name: t for t in model.tensors}
    args.output.mkdir(exist_ok=False)
    for source in args.source.iterdir():
        if ".safetensors" not in source.name and source.is_file():
            shutil.copyfile(source, args.output / source.name)
    template = model.fields["tokenizer.chat_template"].contents()
    (args.output / "chat_template.jinja").write_text(template)
    source = next(args.source.glob("*.safetensors"))
    index = {}
    groups = {}
    converted = set()
    with safe_open(source, framework="pt") as weights:
        for name in weights.keys():
            prefix = name.split(".")[:4] if ".layers." in name else [name.split(".")[1]]
            groups.setdefault(tuple(prefix), []).append(name)
        for number, names in enumerate(groups.values()):
            shard = {}
            for name in names:
                if name.startswith(("model.language_model.", "lm_head.")):
                    key = name.replace("model.language_model.", "model.").replace(".dt_bias", ".dt_proj.bias")
                    mapped = mapping.get_name(key, try_suffixes=(".weight", ".bias"))
                    # The output head shares the token embedding in this checkpoint.
                    if name == "lm_head.weight" and "output.weight" not in tensors:
                        mapped = "token_embd.weight"
                    if mapped not in tensors:
                        raise ValueError((name, mapped))
                    tensor = tensors[mapped]
                    value = torch.from_numpy(gguf.dequantize(tensor.data, tensor.tensor_type).copy())
                    if name.endswith(".A_log"):
                        value = (-value).log()
                    if name.endswith("norm.weight") and not name.endswith("linear_attn.norm.weight"):
                        value = value - 1
                    original = weights.get_slice(name)
                    value = value.reshape(original.get_shape()).to(torch.bfloat16)
                    converted.add(mapped)
                else:
                    value = weights.get_tensor(name)
                shard[name] = value
            filename = f"model-{number + 1:05}-of-{len(groups):05}.safetensors"
            save_file(shard, args.output / filename, metadata={"format": "pt"})
            index.update(dict.fromkeys(names, filename))
    unused = set(tensors) - converted
    assert all(name.startswith("blk.24.") for name in unused), sorted(unused)
    (args.output / "model.safetensors.index.json").write_text(json.dumps({"metadata": {}, "weight_map": index}))
    print(f"Reconstructed {len(converted)} production tensors, omitted {len(unused)} inactive draft-head tensors")


if __name__ == "__main__":
    main()
