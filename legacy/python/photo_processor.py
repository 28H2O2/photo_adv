# 功能：智能照片裁剪引擎，参考 iOS 26 锁屏照片处理效果（主体感知构图优化 + 分层 depth 效果模拟）
# 输入：PIL.Image 对象（来自用户上传文件或路径转换），目标宽度/高度（像素）或宽高比，处理选项（是否锁屏模式、时钟文本等）
# 输出：裁剪后的 PIL.Image；对于锁屏预设额外返回带“时钟分层模拟”的合成预览图（主体 lift 在时钟之上）
# 如何运行该文件：作为模块导入使用 from src.photo_processor import process_photo_for_sizes
#   或者 python -c "from src.photo_processor import ...; ..." 进行单元测试
# 依赖了哪些文件：仅标准库 + Pillow + numpy（无外部模型依赖，纯启发式实现；可选 rembg 用于 mask 约束）
# 在整个项目中的作用：核心图像处理模块，被 app.py 调用生成多尺寸推荐结果；是实现“上传一张普通照片 -> 输出多尺寸好看版本”的引擎基础，后续可替换为 ML 模型（ProCrop、rembg+smartcrop、Depth Pro 等）

from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
import numpy as np
from typing import Tuple, List, Dict, Optional
import os

# 默认 iPhone 锁屏参考尺寸（以常见 1170x2532 为例，实际机型略有差异，保持比例即可）
IPHONE_LOCK_WIDTH = 1170
IPHONE_LOCK_HEIGHT = 2532
IPHONE_LOCK_ASPECT = IPHONE_LOCK_WIDTH / IPHONE_LOCK_HEIGHT  # ~0.4615

# 其他常用目标尺寸（宽度, 高度, 是否锁屏模式, 显示名称）
DEFAULT_PRESETS: List[Dict] = [
    {"name": "iPhone 锁屏 (Depth 效果模拟)", "width": IPHONE_LOCK_WIDTH, "height": IPHONE_LOCK_HEIGHT, "is_lock": True},
    {"name": "iPhone 壁纸 9:16", "width": 1170, "height": 2080, "is_lock": False},
    {"name": "横屏壁纸 16:9", "width": 1920, "height": 1080, "is_lock": False},
    {"name": "社交竖版 4:5", "width": 1080, "height": 1350, "is_lock": False},
    {"name": "正方形 1:1", "width": 1080, "height": 1080, "is_lock": False},
    {"name": "故事/短视频 9:16", "width": 1080, "height": 1920, "is_lock": False},
]


def _get_importance_map(image: Image.Image) -> np.ndarray:
    """计算重要性图：结合边缘、饱和度、中心偏置（简化版 smartcrop.js 思路 + iOS 主体中心倾向）"""
    # 1. 边缘强度 (FIND_EDGES 近似拉普拉斯)
    edge_img = image.filter(ImageFilter.FIND_EDGES).convert("L")
    edge_arr = np.array(edge_img, dtype=np.float32) / 255.0

    # 2. 饱和度 (HSV S 通道，彩色区域更“有趣”)
    hsv = image.convert("HSV")
    sat_arr = np.array(hsv.split()[1], dtype=np.float32) / 255.0

    # 3. 中心偏置（照片主体通常不在死角，锁屏也偏好主体与时钟互动的区域）
    h, w = edge_arr.shape
    y_coords, x_coords = np.ogrid[:h, :w]
    cy, cx = h / 2.0, w / 2.0
    dist = np.sqrt((x_coords - cx) ** 2 + (y_coords - cy) ** 2)
    max_dist = np.sqrt(cx**2 + cy**2) + 1e-6
    center_bias = 1.0 - (dist / max_dist)  # 中心=1，边缘=0

    # 加权融合（可后续调参或换成 ML saliency）
    importance = 0.45 * edge_arr + 0.35 * sat_arr + 0.20 * center_bias
    # 平滑一下，减少噪声
    importance = np.clip(importance, 0, 1)
    return importance


def _find_best_crop_box(
    importance: np.ndarray, target_aspect: float, min_scale: float = 0.55, steps: int = 6
) -> Tuple[int, int, int, int]:
    """在 importance map 上搜索给定宽高比的最佳裁剪框（类似 sliding window + 评分）"""
    img_h, img_w = importance.shape
    best_score = -1.0
    best_box = (0, 0, img_w, img_h)

    # 尝试不同尺度
    for scale in np.linspace(min_scale, 0.98, steps):
        crop_h = int(img_h * scale)
        crop_w = int(crop_h * target_aspect)
        if crop_w < 10 or crop_h < 10 or crop_w > img_w or crop_h > img_h:
            continue

        step_y = max(1, crop_h // 8)
        step_x = max(1, crop_w // 8)

        for y in range(0, img_h - crop_h + 1, step_y):
            for x in range(0, img_w - crop_w + 1, step_x):
                region = importance[y : y + crop_h, x : x + crop_w]
                if region.size == 0:
                    continue

                # 基础分数：区域平均重要性
                score = float(region.mean())

                # 轻微规则：避免把高能量完全推到边缘（iOS 喜欢主体有呼吸感）
                edge_penalty = (
                    region[0, :].mean() * 0.15
                    + region[-1, :].mean() * 0.15
                    + region[:, 0].mean() * 0.15
                    + region[:, -1].mean() * 0.15
                )
                score -= edge_penalty * 0.6

                # 轻微 rule-of-thirds 加分（主体落在 1/3 线上更好看）
                thirds_y = [crop_h // 3, 2 * crop_h // 3]
                thirds_x = [crop_w // 3, 2 * crop_w // 3]
                third_sum = sum(region[ty, tx] for ty in thirds_y for tx in thirds_x if ty < crop_h and tx < crop_w)
                score += (third_sum / 4.0) * 0.25

                if score > best_score:
                    best_score = score
                    best_box = (x, y, x + crop_w, y + crop_h)

    return best_box


def _resize_to_target(cropped: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """高质量 resize（LANCZOS）"""
    return cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)


def _create_lock_screen_depth_preview(
    cropped: Image.Image, clock_text: str = "9:41", date_text: str = "星期一  6月3日"
) -> Image.Image:
    """
    模拟 iOS 锁屏 Depth Effect：
    - 背景放完整裁剪图 + 绘制时钟（“藏”在后面）
    - 用软 mask 抠出“主体”层叠加在时钟上方，形成分层 lift 效果
    - 颜色/位置参考 iOS 常见（白色时钟 + 阴影）
    """
    w, h = cropped.size
    # 1. 背景层（带时钟）
    bg = cropped.copy()
    draw = ImageDraw.Draw(bg)

    # 尝试加载系统字体（macOS 优先），失败则用默认
    font_size = max(28, int(h * 0.065))
    font = None
    font_paths = [
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                font = ImageFont.truetype(fp, font_size)
                break
            except Exception:
                pass
    if font is None:
        font = ImageFont.load_default()

    # 时钟位置：顶部居中（iOS 典型）
    clock_y = int(h * 0.085)
    # 绘制带阴影的时钟（模拟被主体盖住一部分的感觉）
    shadow_offset = max(2, font_size // 18)
    draw.text((w // 2 + shadow_offset, clock_y + shadow_offset), clock_text, font=font, fill=(0, 0, 0, 120), anchor="mt")
    draw.text((w // 2, clock_y), clock_text, font=font, fill=(255, 255, 255), anchor="mt")

    # 小字日期（可选，iOS 常有）
    small_font = None
    try:
        if font is not None:
            small_font = font.font_variant(size=max(14, font_size // 3))
    except Exception:
        small_font = font
    if small_font:
        draw.text((w // 2, clock_y + font_size + 8), date_text, font=small_font, fill=(255, 255, 255, 200), anchor="mt")

    # 2. 构造“主体 lift”层（用中心偏上软 mask 模拟 iOS 主体突出）
    # 简单但有效：用一个大椭圆软 mask 覆盖主体区域（上半 + 中心），模拟主体被“抬”到最前
    mask = Image.new("L", (w, h), 0)
    mask_draw = ImageDraw.Draw(mask)
    # 椭圆覆盖上 70% 高度，宽度留边（给主体呼吸）
    margin_x = int(w * 0.08)
    top = int(h * 0.02)
    bot = int(h * 0.72)
    mask_draw.ellipse([margin_x, top, w - margin_x, bot], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=max(12, int(h * 0.025))))

    # 轻微提亮“主体”区域，增强 pop 感（类似 iOS 渲染）
    enhancer = ImageEnhance.Brightness(cropped)
    fg = enhancer.enhance(1.06)
    contrast = ImageEnhance.Contrast(fg)
    fg = contrast.enhance(1.03)

    # 3. 合成：mask 高的地方用 fg（主体在前），低的地方用 bg（时钟可见）
    preview = Image.composite(fg, bg, mask)

    # 轻微整体对比增强，让效果更“高级”
    final_enh = ImageEnhance.Contrast(preview)
    preview = final_enh.enhance(1.04)

    return preview


def process_single_size(
    image: Image.Image,
    target_width: int,
    target_height: int,
    is_lock: bool = False,
    clock_text: str = "9:41",
) -> Tuple[Image.Image, Optional[Image.Image]]:
    """
    对单尺寸进行智能裁剪。
    返回 (最终裁剪图, 锁屏预览图或 None)
    """
    if image.mode != "RGB":
        image = image.convert("RGB")

    orig_w, orig_h = image.size
    target_aspect = target_width / target_height

    # 计算 importance 并搜索最佳 box
    importance = _get_importance_map(image)
    box = _find_best_crop_box(importance, target_aspect)

    # 裁剪 + resize 到精确目标尺寸（保证不同尺寸输出一致像素）
    cropped = image.crop(box)
    final = _resize_to_target(cropped, target_width, target_height)

    preview = None
    if is_lock:
        # 生成带分层模拟的锁屏预览（使用目标尺寸）
        preview = _create_lock_screen_depth_preview(final, clock_text=clock_text)

    return final, preview


def process_photo_for_sizes(
    image: Image.Image,
    presets: Optional[List[Dict]] = None,
    clock_text: str = "9:41",
) -> List[Dict]:
    """
    主入口：处理一张照片，输出多个预设尺寸的结果。
    返回列表，每项包含 name, cropped (PIL), preview (PIL or None), size_str
    """
    if presets is None:
        presets = DEFAULT_PRESETS

    results = []
    for preset in presets:
        name = preset["name"]
        tw, th = preset["width"], preset["height"]
        is_lock = preset.get("is_lock", False)

        cropped, preview = process_single_size(
            image, tw, th, is_lock=is_lock, clock_text=clock_text
        )

        results.append(
            {
                "name": name,
                "cropped": cropped,
                "preview": preview,
                "size": f"{tw}×{th}",
                "is_lock": is_lock,
            }
        )
    return results


# 方便命令行/测试直接调用
if __name__ == "__main__":
    # 简单自测：生成一个“构图一般”的合成照片（主体偏左 + 边缘杂乱）
    print("Running self-test with synthetic mediocre photo...")
    test_img = Image.new("RGB", (1200, 900), (245, 240, 235))
    draw = ImageDraw.Draw(test_img)
    # 背景噪点/线条（模拟杂乱）
    for i in range(0, 1200, 35):
        draw.line([(i, 0), (i + 80, 900)], fill=(220, 215, 210), width=2)
    # “主体”偏左下（典型不好的随手拍）
    draw.ellipse([80, 420, 420, 820], fill=(70, 130, 180))  # 蓝色“人/物体”
    draw.ellipse([140, 480, 360, 760], fill=(200, 180, 160))  # 脸/亮部
    # 右上角干扰物
    draw.rectangle([950, 50, 1150, 250], fill=(180, 100, 80))

    results = process_photo_for_sizes(test_img)
    os.makedirs("/tmp/photo_adv_test", exist_ok=True)
    for r in results:
        safe_name = r['name'].replace(' ', '_').replace('(', '').replace(')', '').replace('/', '_').replace(':', '_')
        out_path = f"/tmp/photo_adv_test/{safe_name}.png"
        r["cropped"].save(out_path)
        print(f"Saved cropped: {out_path}")
        if r["preview"]:
            prev_path = out_path.replace(".png", "_depth_preview.png")
            r["preview"].save(prev_path)
            print(f"Saved depth preview: {prev_path}")
    print("Self-test finished. Check /tmp/photo_adv_test/ for outputs.")