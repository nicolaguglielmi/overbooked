"""Offline sprite generation with Gemini image models (run once, commit the PNGs).

    python3 tools/gen_sprites.py                 # all missing sprites
    python3 tools/gen_sprites.py murphy dog      # only these (regenerates)
    python3 tools/gen_sprites.py --ref           # (re)make the style reference
    python3 tools/gen_sprites.py --webp          # WebP copies for the single-file build

Every sprite is drawn on flat magenta, keyed to transparency, trimmed and
scaled to SPRITE_H pixels. The style reference (tools/sprites_raw/_ref.png) is
sent with each request so the whole cast looks like one family.
Never called at runtime.
"""
import base64, io, json, os, ssl, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "tools", "sprites_raw")
OUT = os.path.join(ROOT, "assets", "sprites")
REF = os.path.join(RAW, "_ref.png")
MODEL = os.environ.get("SPRITE_MODEL", "gemini-3-pro-image")
SPRITE_H = 160
# python.org builds on macOS ship without CA certificates: use the system bundle
SSL_CTX = ssl.create_default_context(cafile="/etc/ssl/cert.pem") if os.path.exists("/etc/ssl/cert.pem") else None

def load_key():
    for line in open(os.path.join(ROOT, ".env"), encoding="utf-8"):
        line = line.strip()
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("GEMINI_API_KEY missing in .env")

STYLE = (
    "A single cute chibi video-game character sticker in a bold flat vector style: thick dark navy "
    "outline, bright saturated flat colors with one step of soft cel shading, big round head "
    "(head about 40% of the height), big friendly eyes, full body standing, 3/4 front view seen "
    "slightly from above, both feet visible, centered with a comfortable margin. "
    "STRICT: solid pure flat magenta #FF00FF background filling the entire canvas edge to edge, "
    "no magenta or pink anywhere on the character, no ground, no cast shadow, no text, no letters, "
    "no logos, no watermark, no frame."
)
LANYARD = "a lanyard around the neck holding a blank white staff badge"

SPRITES = {
    # the team (role colours are the GDG brand colours)
    "org_lead": f"an event organizer in a royal blue (#4285F4) zip hoodie, dark jeans, white sneakers, {LANYARD}, holding a black walkie-talkie raised in one hand, confident smile, short dark hair",
    "org_tech": f"an AV technician organizer in a bright red (#EA4335) t-shirt with a black headset around the neck, cargo trousers, a tool belt with coiled cables and an HDMI adapter, {LANYARD}, determined grin, curly hair",
    "org_host": f"a welcome-desk organizer in a sunny yellow (#FBBC04) polo shirt, holding a clipboard and a stack of name badges, {LANYARD}, cheerful, hair in a bun",
    "org_care": f"a speaker-care organizer in a green (#34A853) shirt with rolled sleeves, holding a tablet showing a schedule, {LANYARD}, calm reassuring smile, glasses, long hair",
    "volunteer": f"a young event volunteer in a green t-shirt and a green cap, {LANYARD}, waving with one hand, enthusiastic",
    # speakers
    "speaker_a": "a tech conference speaker in a navy blazer over a white t-shirt, carrying a silver laptop under one arm, nervous smile, slicked hair, a red lanyard",
    "speaker_b": "a tech conference speaker in a grey hoodie, holding a laptop covered in colourful stickers, beanie hat, beard, a red lanyard",
    "speaker_c": "a tech conference speaker in a teal blouse, holding a presentation clicker, confident, short bob haircut, a red lanyard",
    # attendees
    "att_1": "a young developer attendee in a black hoodie with headphones around the neck and a laptop backpack",
    "att_2": "a university student attendee with a big backpack, denim jacket, holding a coffee cup",
    "att_3": "a designer attendee with a mustard beanie, striped shirt and a tote bag",
    "att_4": "a senior developer attendee with a grey beard, flannel shirt and a laptop bag",
    "att_5": "a woman developer attendee wearing a lavender hijab and a cardigan, holding a phone",
    "att_6": "an attendee in a wheelchair with a laptop on the lap, smiling, wearing a orange sweater",
    "att_7": "a developer attendee in a colourful conference t-shirt, curly afro hair, holding a sticker sheet",
    "att_8": "an older attendee with white hair, round glasses and a notebook, wearing a blue vest",
    # chaos
    "murphy": "a mischievous small purple gremlin mascot with two little curved horns, pointy ears, big grin with two pointy teeth, holding a big silver wrench over the shoulder, sneaky tiptoe pose, alone",
    "dog": "a scruffy happy brown and white mutt dog with a wagging tail and a red collar, trotting",
    "vip": "a local mayor VIP in a dark suit wearing a green-white-red tricolour sash across the chest, waving politely",
    "rider": "a food delivery rider with a helmet holding a tall stack of pizza boxes",
    "press": "a local journalist holding a microphone and a small camera, press badge, trench coat",
    "sponsor": "a sponsor representative in a polo shirt holding a roll-up banner tube and a tote bag full of swag",
    # Women Techmakers and the night hackathon
    "kid": "a cheerful small child about five years old in a bright yellow raincoat and red rain boots, hugging a small teddy bear, curious look",
    "hacker": "a tired young hackathon participant in an oversized dark grey hoodie with the hood half up, holding an open laptop and a can of energy drink, messy hair, sleepy but determined",
    "judge": "a hackathon jury member in a smart navy blazer over a white t-shirt, holding a clipboard with a scorecard and a pen, friendly but serious, short grey hair, a red lanyard",
    "neighbor": "a grumpy elderly neighbor in a striped bathrobe and slippers, holding a flashlight, hair in curlers, frowning",
}

REF_PROMPT = (
    "Character lineup sheet for a cute co-op video game about running a tech conference: four event "
    "organizers standing side by side, each in a different solid colour outfit (royal blue hoodie with "
    "walkie-talkie, red t-shirt with headset and cables, yellow polo with clipboard, green shirt with "
    "tablet), all wearing staff lanyards, plus a small purple gremlin mascot with horns and a wrench. "
    "Bold flat vector sticker style, thick dark navy outlines, chibi proportions with big heads, "
    "bright saturated colours, one step of cel shading, 3/4 front view slightly from above. "
    "Solid pure flat magenta #FF00FF background, no text, no logos."
)

def call(key, prompt, ref_bytes=None, tries=3):
    parts = []
    if ref_bytes:
        parts.append({"inlineData": {"mimeType": "image/png", "data": base64.b64encode(ref_bytes).decode()}})
        prompt = ("The attached image is ONLY a style reference: match its drawing style, outline weight, colour "
                  "treatment and proportions, but DO NOT copy its characters or layout. Draw exactly ONE single "
                  "new character, alone, nothing else in the picture. " + prompt)
    parts.append({"text": prompt})
    body = json.dumps({
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "1:1"}},
    }).encode()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "x-goog-api-key": key})
            with urllib.request.urlopen(req, timeout=180, context=SSL_CTX) as r:
                j = json.loads(r.read())
            for p in j.get("candidates", [{}])[0].get("content", {}).get("parts", []):
                if "inlineData" in p:
                    return base64.b64decode(p["inlineData"]["data"])
            raise RuntimeError("no image in response: " + json.dumps(j)[:300])
        except (urllib.error.HTTPError, urllib.error.URLError, RuntimeError, TimeoutError) as e:
            msg = e.read().decode()[:300] if isinstance(e, urllib.error.HTTPError) else str(e)
            print(f"  retry {attempt + 1}: {msg}", flush=True)
            time.sleep(4 * (attempt + 1))
    raise RuntimeError("giving up")

def key_out(img):
    """Magenta chroma key with a soft edge and despill, then trim."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    br, bg_, bb = px[2, 2][:3]
    T, F = 70, 50
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d = ((r - br) ** 2 + (g - bg_) ** 2 + (b - bb) ** 2) ** 0.5
            if d < T:
                px[x, y] = (0, 0, 0, 0)
                continue
            if d < T + F:
                a = int(255 * (d - T) / F)
            # despill: magenta fringe has r and b both above g
            if r > g + 20 and b > g + 20:
                m = min(r, b)
                r = int((r + g) / 2 + (r - m) * 0.25)
                b = int((b + g) / 2 + (b - m) * 0.25)
            px[x, y] = (r, g, b, a)
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img

def finish(name, raw):
    os.makedirs(OUT, exist_ok=True)
    img = key_out(Image.open(io.BytesIO(raw)))
    scale = SPRITE_H / img.height
    img = img.resize((max(1, round(img.width * scale)), SPRITE_H), Image.LANCZOS)
    img.save(os.path.join(OUT, name + ".png"), optimize=True)
    return img.size

# the reference sheet already contains Murphy: drawing him from it makes the
# model copy the whole sheet, so he is drawn from the description alone
NO_REF = {"murphy"}

def make(key, name, prompt, ref):
    raw = call(key, STYLE + " Character: " + prompt + ".", None if name in NO_REF else ref)
    os.makedirs(RAW, exist_ok=True)
    v = len([f for f in os.listdir(RAW) if f.startswith(name + "_v")]) + 1
    open(os.path.join(RAW, f"{name}_v{v}.png"), "wb").write(raw)
    size = finish(name, raw)
    print(f"ok {name} {size}", flush=True)

def webp():
    """WebP copies (about a third of the PNG weight) embedded by tools/build.mjs."""
    from PIL import Image
    for f in sorted(os.listdir(OUT)):
        if f.endswith(".png"):
            Image.open(os.path.join(OUT, f)).save(os.path.join(OUT, f[:-4] + ".webp"), "WEBP", quality=86, method=6)
    print("ok webp", flush=True)

def main():
    if "--webp" in sys.argv:
        return webp()
    key = load_key()
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    os.makedirs(RAW, exist_ok=True)
    if "--ref" in sys.argv or not os.path.exists(REF):
        print("style reference…", flush=True)
        open(REF, "wb").write(call(key, REF_PROMPT))
        print("ok reference", flush=True)
        if "--ref" in sys.argv and not args:
            return
    ref = open(REF, "rb").read()
    names = args or [n for n in SPRITES if not os.path.exists(os.path.join(OUT, n + ".png"))]
    with ThreadPoolExecutor(max_workers=4) as ex:
        for f in [ex.submit(make, key, n, SPRITES[n], ref) for n in names]:
            try:
                f.result()
            except Exception as e:
                print("FAIL", e, flush=True)

if __name__ == "__main__":
    main()
