/**
 * CropEngine
 * 
 * 功能：纯前端智能裁剪引擎（参考 iOS 26 锁屏主体感知 + Depth Effect）
 * 输入：
 *   - 原始用户照片 (HTMLImageElement)
 *   - 目标锁屏 frame 尺寸（默认 1170x2532）
 *   - 通过 updateTransform 控制当前视图的平移/缩放
 * 输出：
 *   - 渲染到 canvas 的锁屏预览（含时钟分层模拟）
 *   - 基于当前 framing 计算其他尺寸的裁剪结果
 *   - autoRecommend() 使用 smartcrop.js 给出高质量起点
 * 
 * 核心思路（从 Python 版 port + 改进）：
 *   - 使用 smartcrop.js 进行内容感知裁剪（边缘、饱和、构图）
 *   - 当前视图用 transform (scale, tx, ty) 表示用户在 iPhone frame 里看到的照片区域
 *   - Depth 模拟：canvas 分层绘制（背景照片 → 时钟 → 主体 lift 层使用软 mask）
 * 
 * 如何使用：
 *   const engine = new CropEngine()
 *   engine.loadImage(img)
 *   engine.autoRecommend()           // 智能起点
 *   engine.updateTransform({scale: 1.1, tx: 20, ty: -30})
 *   engine.draw(lockCanvas)          // 实时绘制
 * 
 * 依赖：smartcrop (npm)
 */

import smartcrop from 'smartcrop'

export interface Transform {
  scale: number
  tx: number   // 照片在画布上的偏移（像素，相对于 frame 中心）
  ty: number
}

export interface SizePreset {
  name: string
  width: number
  height: number
  isLock: boolean
}

export const LOCK_FRAME = { width: 1170, height: 2532 }
export const PRESETS: SizePreset[] = [
  { name: 'iPhone 锁屏', width: 1170, height: 2532, isLock: true },
  { name: 'iPhone 壁纸 9:16', width: 1170, height: 2080, isLock: false },
  { name: '横屏 16:9', width: 1920, height: 1080, isLock: false },
  { name: '竖版 4:5', width: 1080, height: 1350, isLock: false },
  { name: '正方形', width: 1080, height: 1080, isLock: false },
  { name: '故事 9:16', width: 1080, height: 1920, isLock: false },
]

export class CropEngine {
  private original: HTMLImageElement | null = null
  private transform: Transform = { scale: 1, tx: 0, ty: 0 }
  private frameW = LOCK_FRAME.width
  private frameH = LOCK_FRAME.height

  loadImage(img: HTMLImageElement) {
    this.original = img
    // 默认让照片稍微放大并居中（给用户呼吸空间）
    const imgAspect = img.width / img.height
    const frameAspect = this.frameW / this.frameH

    let scale: number
    if (imgAspect > frameAspect) {
      scale = this.frameH / img.height * 1.15
    } else {
      scale = this.frameW / img.width * 1.15
    }

    this.transform = {
      scale: Math.min(scale, 2.8),
      tx: 0,
      ty: 40, // 稍微往下，模拟 iOS 主体偏上与时钟互动的习惯
    }
  }

  getTransform(): Transform {
    return { ...this.transform }
  }

  updateTransform(partial: Partial<Transform>) {
    this.transform = { ...this.transform, ...partial }
    // 限制 scale
    this.transform.scale = Math.max(0.6, Math.min(this.transform.scale, 3.5))
  }

  /**
   * 使用 smartcrop.js 给出推荐构图，并转换为当前 frame 的 transform
   */
  async autoRecommend(): Promise<void> {
    if (!this.original) return

    const options = {
      width: this.frameW,
      height: this.frameH,
      minScale: 0.6,
      // 可以加 boost 区域（后续 MediaPipe mask 可以塞这里）
    }

    const result = await smartcrop.crop(this.original, options)
    const crop = result.topCrop

    // 把 smartcrop 返回的 crop rect 转换成我们需要的 transform
    // 目标：让 crop 区域填满整个 frame（居中）
    const cropCenterX = crop.x + crop.width / 2
    const cropCenterY = crop.y + crop.height / 2

    const neededScale = Math.max(
      this.frameW / crop.width,
      this.frameH / crop.height
    )

    const finalScale = Math.min(neededScale * 0.98, 2.8)

    // 计算偏移，让 crop 中心对齐 frame 中心
    const photoDisplayW = this.original.width * finalScale
    const photoDisplayH = this.original.height * finalScale

    const targetCenterX = this.frameW / 2
    const targetCenterY = this.frameH / 2

    const photoLeft = targetCenterX - (cropCenterX / this.original.width) * photoDisplayW
    const photoTop = targetCenterY - (cropCenterY / this.original.height) * photoDisplayH

    this.transform = {
      scale: finalScale,
      tx: photoLeft,
      ty: photoTop,
    }
  }

  /**
   * 在目标 canvas 上绘制完整的锁屏预览（含 depth 分层模拟）
   */
  draw(canvas: HTMLCanvasElement, clockText = '9:41', dateText = '星期一  6月3日') {
    if (!this.original) return
    const ctx = canvas.getContext('2d', { alpha: true })!
    const { width: fw, height: fh } = { width: this.frameW, height: this.frameH }

    // 保证 canvas 尺寸正确
    if (canvas.width !== fw || canvas.height !== fh) {
      canvas.width = fw
      canvas.height = fh
    }

    ctx.save()
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, fw, fh)

    const img = this.original
    const s = this.transform.scale
    const dw = img.width * s
    const dh = img.height * s
    const dx = this.transform.tx
    const dy = this.transform.ty

    // 1. 绘制背景照片
    ctx.drawImage(img, dx, dy, dw, dh)

    // 2. 绘制时钟层（白色 + 轻微阴影，模拟被盖住）
    this._drawClock(ctx, fw, fh, clockText, dateText)

    // 3. 主体 lift 层（用软 mask 模拟 iOS 把主体抠到最前）
    this._drawSubjectLift(ctx, img, dx, dy, dw, dh)

    ctx.restore()
  }

  private _drawClock(ctx: CanvasRenderingContext2D, fw: number, fh: number, clock: string, date: string) {
    const y = fh * 0.09
    ctx.save()
    ctx.font = `bold ${Math.round(fh * 0.065)}px -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillText(clock, fw / 2 + 2.5, y + 2.5)

    // 主时钟（iOS 风格纯白）
    ctx.fillStyle = '#ffffff'
    ctx.fillText(clock, fw / 2, y)

    // 日期
    ctx.font = `500 ${Math.round(fh * 0.022)}px -apple-system, system-ui`
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText(date, fw / 2, y + Math.round(fh * 0.055))

    ctx.restore()
  }

  private _drawSubjectLift(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    dx: number, dy: number, dw: number, dh: number
  ) {
    const fw = this.frameW
    const fh = this.frameH

    // 使用 destination-in 技巧实现软主体 lift：
    // 1. 在临时 canvas 上画 mask（白色 = 要 lift 的区域）
    // 2. 把照片画到另一个图层
    // 3. 用 mask 作为 alpha 把照片“盖”在 clock 之上

    const maskC = document.createElement('canvas')
    maskC.width = fw
    maskC.height = fh
    const mctx = maskC.getContext('2d')!

    // 渐变椭圆 mask（上半 + 中心，模拟主体突出）
    const grad = mctx.createRadialGradient(
      fw * 0.5, fh * 0.36, Math.min(fw, fh) * 0.18,
      fw * 0.5, fh * 0.44, Math.min(fw, fh) * 0.55
    )
    grad.addColorStop(0.0, '#fff')
    grad.addColorStop(0.7, '#fff')
    grad.addColorStop(1.0, 'rgba(255,255,255,0.0)')

    mctx.fillStyle = grad
    mctx.fillRect(0, 0, fw, fh)

    // 可选：再模糊 mask 让过渡更自然（部分浏览器支持）
    // mctx.filter = 'blur(18px)'; mctx.drawImage(maskC, 0, 0); mctx.filter = 'none';

    // 把照片画到临时图层
    const photoLayer = document.createElement('canvas')
    photoLayer.width = fw
    photoLayer.height = fh
    const pctx = photoLayer.getContext('2d')!
    pctx.drawImage(img, dx, dy, dw, dh)

    // 使用 mask 作为 alpha 合成 lift 层
    ctx.save()
    ctx.globalAlpha = 0.95
    ctx.drawImage(photoLayer, 0, 0)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(maskC, 0, 0)
    ctx.restore()
  }

  /**
   * 根据当前 transform，计算某张预设尺寸下的裁剪结果（返回裁剪后的 Image）
   */
  async getCroppedForPreset(preset: SizePreset): Promise<HTMLImageElement> {
    if (!this.original) throw new Error('no image')

    // 简化策略：把当前 lock frame 里用户看到的“可见矩形”映射到新尺寸
    // 更精确的做法是把 transform 反推回 original 坐标系的 crop rect，再按新 aspect 调整
    const img = this.original
    const s = this.transform.scale

    // 当前在 frame 坐标系里照片的左上角和尺寸
    const photoLeft = this.transform.tx
    const photoTop = this.transform.ty
    const photoW = img.width * s
    const photoH = img.height * s

    // frame 可见区域在照片坐标系的比例
    const visibleLeftRatio = Math.max(0, -photoLeft / photoW)
    const visibleTopRatio = Math.max(0, -photoTop / photoH)
    const visibleW = Math.min(1, this.frameW / photoW)
    const visibleH = Math.min(1, this.frameH / photoH)

    // 映射到原图像素
    let cropX = Math.round(visibleLeftRatio * img.width)
    let cropY = Math.round(visibleTopRatio * img.height)
    let cropW = Math.round(visibleW * img.width)
    let cropH = Math.round(visibleH * img.height)

    // 按目标 preset aspect 微调（保持主体）
    const targetAspect = preset.width / preset.height
    const currentAspect = cropW / cropH

    if (currentAspect > targetAspect) {
      const newW = Math.round(cropH * targetAspect)
      cropX += Math.round((cropW - newW) / 2)
      cropW = newW
    } else {
      const newH = Math.round(cropW / targetAspect)
      cropY += Math.round((cropH - newH) / 2)
      cropH = newH
    }

    // 边界保护
    cropX = Math.max(0, Math.min(cropX, img.width - 10))
    cropY = Math.max(0, Math.min(cropY, img.height - 10))
    cropW = Math.min(cropW, img.width - cropX)
    cropH = Math.min(cropH, img.height - cropY)

    // 裁剪并 resize 到精确目标尺寸
    const off = document.createElement('canvas')
    off.width = preset.width
    off.height = preset.height
    const octx = off.getContext('2d', { alpha: false })!
    octx.imageSmoothingQuality = 'high'

    octx.drawImage(
      img,
      cropX, cropY, cropW, cropH,
      0, 0, preset.width, preset.height
    )

    // 转成 Image 返回
    return new Promise((resolve) => {
      const result = new Image()
      result.onload = () => resolve(result)
      result.src = off.toDataURL('image/png')
    })
  }
}
