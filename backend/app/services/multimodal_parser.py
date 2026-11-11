async def parse_image_scene(image_path: str, scene: str) -> dict:
    return {"scene": scene, "image_path": image_path, "reserved": True}
