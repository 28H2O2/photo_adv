# Legacy Python 实现（已归档）

这是 photo_adv 项目的早期 Python 版本实现（使用 Gradio + Pillow + numpy）。

## 包含内容
- `app.py`：Gradio Web UI，支持上传照片，生成多尺寸智能裁剪结果（含 iPhone 锁屏 Depth 模拟预览）。
- `photo_processor.py`：核心处理引擎。
  - 启发式 importance map（边缘 + 饱和度 + 中心偏置）
  - 滑动窗口搜索最佳 crop box（带边缘惩罚 + rule-of-thirds 加分）
  - `_create_lock_screen_depth_preview`：使用软椭圆 mask 模拟主体 lift + 时钟分层合成（完全对应 iOS sandwich effect）。
- `requirements.txt`：Python 依赖。

## 为什么归档？
用户明确要求“做一个前端项目，而不是 python 启动的”。

核心算法逻辑（importance 计算、crop 搜索、depth 分层合成）已完整 port 到新的前端 TypeScript + Canvas 实现中（见根目录 `src/CropEngine.ts` 等）。

## 用途
- **算法参考与对比**：Python 版和 JS 版可以对照，验证 port 是否一致。
- **历史记录**：保留第一次实现时的设计决策。
- **未来**：如果需要 Python 后端服务（批量处理、更高精度模型），可以从这里恢复/扩展。

## 运行旧版（仅供参考）
```bash
cd legacy/python
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

**注意**：旧版依赖系统可能有 numpy 版本冲突等问题，新前端完全客户端，无此问题。

---

归档日期：2026-06-03
由 grill-me + 用户确认后执行（前端优先，保留参考）。
