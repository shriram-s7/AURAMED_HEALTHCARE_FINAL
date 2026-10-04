from io import BytesIO

from PIL import Image, ImageDraw, ImageFilter

from app.services.image_quality import assess_image_set


def _png_bytes(image: Image.Image) -> bytes:
    stream = BytesIO()
    image.save(stream, format="PNG")
    return stream.getvalue()


def _sharp_test_pattern() -> bytes:
    image = Image.new("L", (256, 256), color=20)
    draw = ImageDraw.Draw(image)
    for x in range(0, 256, 16):
        draw.line((x, 0, x, 255), fill=220, width=2)
    for y in range(0, 256, 16):
        draw.line((0, y, 255, y), fill=220, width=2)
    return _png_bytes(image)


def test_sharp_image_passes_technical_checks():
    result = assess_image_set("cervical", [("sharp.png", _sharp_test_pattern())])
    assert result["quality"] == "adequate"
    assert result["reasons"] == []


def test_blank_image_is_rejected_with_exposure_reason():
    result = assess_image_set("pcos", [("blank.png", _png_bytes(Image.new("L", (256, 256), color=0)))])
    assert result["quality"] == "poor"
    assert any("black" in reason.lower() for reason in result["reasons"])


def test_overexposed_image_is_rejected():
    result = assess_image_set("pcos", [("white.png", _png_bytes(Image.new("L", (256, 256), color=255)))])
    assert result["quality"] == "poor"
    assert any("white" in reason.lower() for reason in result["reasons"])


def test_blurred_image_is_rejected():
    blurred = Image.open(BytesIO(_sharp_test_pattern())).filter(ImageFilter.GaussianBlur(radius=8))
    result = assess_image_set("cervical", [("blurred.png", _png_bytes(blurred))])
    assert result["quality"] == "poor"
    assert any("blurred" in reason.lower() for reason in result["reasons"])


def test_breast_requires_mlo_and_cc_views():
    content = _sharp_test_pattern()
    missing = assess_image_set("breast", [("right-mlo.png", content)], ["R MLO"])
    complete = assess_image_set(
        "breast",
        [("right-mlo.png", content), ("right-cc.png", content)],
        ["R MLO", "R CC"],
    )
    assert missing["quality"] == "poor"
    assert missing["missing_required_views"] == ["CC"]
    assert complete["quality"] == "adequate"


def test_unsupported_image_is_rejected_clearly():
    result = assess_image_set("pcos", [("scan.dcm", b"not an image")])
    assert result["quality"] == "poor"
    assert "supported raster image" in result["reasons"][0]


def test_bundled_demo_cases_pass_real_image_quality_checks():
    import json
    from pathlib import Path
    root=Path(__file__).resolve().parents[2]/'frontend'
    pairs=json.loads((root/'src/config/breastDemoPairs.json').read_text())
    for tier, images in pairs.items():
        files=[(item['src'].split('/')[-1],(root/'public'/item['src'].lstrip('/')).read_bytes()) for item in images]
        result=assess_image_set('breast',files,[item['view'] for item in images])
        assert result['quality']=='adequate',(tier,result)
    for module,names in {'cervical':['cervical_ascus_00.jpg','cervical_hsil_00.jpg'],'pcos':['pcos_normal_02.jpg','pcos_pcos_00.jpg','pcos_pcos_02.jpg']}.items():
        for name in names:
            result=assess_image_set(module,[(name,(root/'public/reference-images'/module/name).read_bytes())])
            assert result['quality']=='adequate',(module,name,result)

    sample=root/'public/demo-cases/cervical/normal.bmp'
    assert assess_image_set('cervical',[(sample.name,sample.read_bytes())])['quality']=='adequate'
