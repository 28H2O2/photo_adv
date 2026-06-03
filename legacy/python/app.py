#!/usr/bin/env python3
"""
PhotoAdv - 像 iOS 26 一样智能裁剪你的照片
Gradio Web 界面：上传一张照片，自动生成多个常用尺寸的“好看”版本。
特别为 iPhone 锁屏提供 Depth Effect 分层模拟预览（时钟藏在主体后）。

参考调研：docs/research/20250603-iOS锁屏深度效果技术原理解析与开源替代方案.md
核心算法在 src/photo_processor.py （启发式 importance map + 主体中心构图 + 分层合成）

运行方式：
  python app.py
  浏览器自动打开 http://127.0.0.1:7860
"""

import gradio as gr
from PIL import Image
import os
from datetime import datetime

from src.photo_processor import process_photo_for_sizes, DEFAULT_PRESETS


def _prepare_input_image(uploaded: Image.Image) -> Image.Image:
    """预处理：转 RGB，限制最大尺寸防止内存爆炸（保持细节但可运行）"""
    if uploaded is None:
        raise gr.Error("请先上传一张照片！")
    if uploaded.mode != "RGB":
        uploaded = uploaded.convert("RGB")
    # 限制长边 <= 1600px（足够 iPhone 锁屏质量，加快处理）
    max_side = 1600
    w, h = uploaded.size
    if max(w, h) > max_side:
        scale = max_side / max(w, h)
        new_size = (int(w * scale), int(h * scale))
        uploaded = uploaded.resize(new_size, Image.Resampling.LANCZOS)
    return uploaded


def smart_crop_multiple_sizes(
    uploaded_image: Image.Image,
    clock_time: str = "9:41",
    show_original: bool = True,
) -> List:
    """
    主处理函数：上传 -> 多尺寸智能裁剪 + 锁屏 depth 预览
    返回适合 gr.Gallery 的 [(img, label), ...]
    """
    img = _prepare_input_image(uploaded_image)

    # 调用核心引擎
    results = process_photo_for_sizes(img, presets=DEFAULT_PRESETS, clock_text=clock_time)

    gallery_items = []

    # 可选显示原图（帮助对比“变好”效果）
    if show_original:
        gallery_items.append((img, "原始照片（上传）"))

    for r in results:
        label = f"{r['name']}  |  {r['size']}"
        if r["preview"] is not None:
            # 锁屏模式：优先展示带 depth 模拟的预览（更直观）
            gallery_items.append((r["preview"], f"{label}  —  iOS26 Depth 模拟预览"))
            # 同时附上纯裁剪结果（用户可下载干净版）
            gallery_items.append((r["cropped"], f"{label}  —  纯裁剪结果"))
        else:
            gallery_items.append((r["cropped"], label))

    return gallery_items


def build_ui():
    with gr.Blocks(title="PhotoAdv · iOS 26 风格智能裁剪", theme=gr.themes.Soft()) as demo:
        gr.Markdown(
            """
            # 📸 PhotoAdv — 像 iPhone iOS 26 一样让你的照片变好看

            **上传一张随手拍（构图一般也没关系）** → 自动智能裁剪成多个尺寸的“好看”版本。

            ### 核心效果参考 iOS 26 锁屏
            - 主体感知构图优化（类似 Apple class-agnostic salient segmentation + framing）
            - 边缘清理 + 中心/三分偏置（让主体突出、画面有呼吸）
            - **iPhone 锁屏专属**：生成带“时钟分层模拟”的 Depth Effect 预览（时钟藏在主体后面，参考调研中的 sandwich + spatial 效果）

            当前使用轻量纯 Python 启发式算法（边缘 + 饱和度 + 中心重要性图 + 滑动窗口搜索），无需重模型即可本地运行。
            后续可无缝升级为 rembg / Depth-Anything / ProCrop 等（见 CLAUDE.md 和 research 文档）。

            **推荐测试**：用你“拍得一般”的照片（主体偏、太空、边缘杂），看看裁剪后是否变漂亮！
            """
        )

        with gr.Row():
            with gr.Column(scale=1):
                input_img = gr.Image(
                    label="上传照片（支持 jpg/png/heic 等）",
                    type="pil",
                    height=420,
                )
                clock_input = gr.Textbox(
                    value="9:41",
                    label="锁屏时钟时间（仅影响预览显示）",
                    max_lines=1,
                )
                show_orig = gr.Checkbox(value=True, label="同时显示原始照片（方便对比）")
                run_btn = gr.Button("🚀 开始智能裁剪（参考 iOS 26 效果）", variant="primary", size="lg")

            with gr.Column(scale=2):
                output_gallery = gr.Gallery(
                    label="推荐结果（点击图片可放大 / 下载）",
                    show_label=True,
                    columns=3,
                    rows=3,
                    height="auto",
                    object_fit="contain",
                )

        # 事件绑定
        run_btn.click(
            fn=smart_crop_multiple_sizes,
            inputs=[input_img, clock_input, show_orig],
            outputs=output_gallery,
        )

        gr.Markdown(
            """
            ---
            ### 使用提示（来自 iOS 经验）
            - 照片有清晰主体（人、建筑、物体）效果最好。
            - 锁屏预览中的“时钟被主体盖住”就是 iOS Depth Effect 的核心魅力。
            - 所有输出都是独立文件，可直接用于设置壁纸。
            - 当前算法为启发式，后续版本会加入真实主体分割（rembg 等）获得更接近 Apple 的效果。

            技术细节 & 调研记录：见 `docs/research/20250603-...md` 和 `CLAUDE.md`
            """
        )

        # 页脚
        gr.Markdown(
            f"""
            <small>PhotoAdv · {datetime.now().year} · 严格遵循 CLAUDE.md 规则构建 · 
            纯本地处理（不会上传你的照片）</small>
            """
        )

    return demo


if __name__ == "__main__":
    demo = build_ui()
    # 启动本地服务（默认浏览器打开）
    demo.launch(
        server_name="127.0.0.1",
        server_port=7860,
        share=False,  # 本地优先，隐私
        inbrowser=True,
    )