from pathlib import Path

from psd_tools import PSDImage


source = Path(r"C:\Users\szrbl\OneDrive\Desktop\vw crafter.psd")
output_dir = Path(__file__).resolve().parent / "vw_crafter_preview"
output_dir.mkdir(exist_ok=True)

psd = PSDImage.open(source)
composite = psd.composite()
composite.save(output_dir / "composite.png")
print("document", psd.size, psd.color_mode, "layers", len(psd))

for index, layer in enumerate(psd):
    rendered = layer.composite()
    rendered.save(output_dir / f"layer_{index}_{layer.name}.png")
    print(
        index,
        layer.name,
        layer.kind,
        layer.bbox,
        "visible=",
        layer.visible,
        "vector_mask=",
        bool(layer.vector_mask),
        "origination=",
        bool(layer.origination),
    )
