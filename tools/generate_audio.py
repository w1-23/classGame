import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACKS = [
    ROOT / "data" / "G1-语文-拼音识字.json",
    ROOT / "data" / "G3-英语-基础词汇听力.json",
    ROOT / "data" / "古诗-常见篇目朗读.json",
]


def synthesize(text, output, voice):
    output.parent.mkdir(parents=True, exist_ok=True)
    script = f"""
Add-Type -AssemblyName System.Speech
$speech = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speech.SelectVoice('{voice}')
$speech.Rate = 0
$speech.SetOutputToWaveFile('{output}')
$speech.Speak('{text}')
$speech.Dispose()
"""
    subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        check=True,
    )


def main():
    generated = []
    for pack_path in PACKS:
        pack = json.loads(pack_path.read_text(encoding="utf-8"))
        for item in pack.get("items", []):
            text = item["prompt"] if pack["id"].startswith("g1") else item["correct"]
            voice = "Microsoft Huihui Desktop" if pack["id"].startswith("g1") else "Microsoft Zira Desktop"
            synthesize(text, ROOT / item["audio"], voice)
            generated.append(item["audio"])
        for poem in pack.get("poems", []):
            text = f'{poem["title"]}，{poem["author"]}。' + "".join(poem["lines"])
            synthesize(text, ROOT / poem["audio"], "Microsoft Huihui Desktop")
            generated.append(poem["audio"])
    print(f"Generated {len(generated)} speech files.")


if __name__ == "__main__":
    main()
