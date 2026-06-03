import './style.css'
import { CropEngine, PRESETS, LOCK_FRAME } from './CropEngine'

const app = document.getElementById('app')!

app.innerHTML = `
  <div class="max-w-7xl mx-auto p-6">
    <header class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-4xl font-semibold tracking-tighter">PhotoAdv</h1>
        <p class="text-zinc-400 mt-1">像 iOS 26 一样 · 纯前端智能裁剪 + 锁屏 Depth 模拟</p>
      </div>
      <div class="text-right text-sm text-zinc-500">
        Vite + TS + Canvas + smartcrop.js<br>
        完全本地 · 无需 Python
      </div>
    </header>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- 左侧：上传 + iPhone 交互编辑器 -->
      <div class="lg:col-span-5 space-y-6">
        <div class="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
          <div class="flex items-center gap-2 mb-3">
            <h2 class="font-medium">1. 上传照片</h2>
            <span class="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded">开始</span>
          </div>
          <div id="upload-zone" 
               class="border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-2xl p-10 text-center cursor-pointer transition-colors active:bg-zinc-950">
            <div class="text-4xl mb-3">📷</div>
            <div class="font-medium">拖拽或点击上传</div>
            <div class="text-xs text-zinc-500 mt-1">JPG / PNG / WebP 等 · 建议主体清晰的照片效果最佳</div>
            <input type="file" id="file-input" accept="image/*" class="hidden" />
          </div>
          <div id="file-info" class="mt-3 text-sm text-emerald-400 hidden"></div>
          <div class="upload-hint mt-2">上传后，照片会加载到右侧的 iPhone 模拟器中供你交互编辑。</div>
        </div>

        <div class="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <h2 class="font-medium">2. iPhone 锁屏 · 实时编辑</h2>
              <span class="text-[10px] px-1.5 py-0.5 bg-blue-950 text-blue-400 rounded">核心魔法区</span>
              <button id="editor-guide-btn" class="text-[10px] px-1.5 py-0.5 border border-zinc-700 hover:bg-zinc-800 rounded text-zinc-400" title="点击查看详细使用说明和 iOS 参考">使用指南</button>
            </div>
            <div class="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">拖拽平移 / 滚轮缩放</div>
          </div>

          <!-- 关键提示：解释左侧这个是什么、怎么用 (常驻简版 + 按钮展开完整指南) -->
          <div class="editor-hint mb-3">
            <strong>左侧核心：iPhone 锁屏交互编辑器</strong><br>
            模拟真实 iOS「设置 → 壁纸」流程。你可以在这里拖拽/缩放调整构图，智能推荐用算法优化起点，实时预览 Depth Effect（时钟被主体遮挡的层次感）。调整会同步右侧所有尺寸结果。<br>
            <span class="text-emerald-400">建议先用构图一般的照片测试，感受「变漂亮」的魔法。</span>
          </div>

          <!-- 完整指南 (默认隐藏，点击按钮显示) -->
          <div id="editor-guide" class="hidden mb-3 p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-300">
            <strong>详细说明（参考 iOS 机制）</strong><br>
            • <strong>拖拽平移 / 滚轮缩放</strong>：直接操作画布，像真机调整照片 framing。<br>
            • <strong>智能推荐</strong>：smartcrop.js 分析边缘、饱和度、主体位置 + 构图规则（三分法、边缘惩罚），自动给出好起点（类似 Apple 的 on-device saliency + framing）。<br>
            • <strong>实时 Depth Effect</strong>：合成时钟层 + 主体 lift 层（mask 遮挡），产生 iOS 26 Spatial / sandwich 效果。<br>
            • 所有调整实时影响右侧多尺寸输出（锁屏、壁纸、社交等）。<br>
            这个区域是“魔法”发生的地方——普通照片在这里被优化成壁纸级好看。
          </div>

          <div id="iphone-container" class="flex justify-center bg-black/40 rounded-2xl p-4 min-h-[340px]"></div>
          
          <div class="grid grid-cols-2 gap-2 mt-4">
            <button id="auto-btn" 
                    class="col-span-1 bg-white hover:bg-zinc-100 active:bg-white text-black font-semibold py-3 rounded-2xl transition active:scale-[0.985] flex items-center justify-center gap-2"
                    title="使用 smartcrop.js 算法自动分析并推荐最佳构图起点（边缘 + 饱和 + 构图规则）">
              ✨ 智能推荐
            </button>
            <button id="reset-btn"
                    class="col-span-1 border border-zinc-700 hover:bg-zinc-950 py-3 rounded-2xl transition"
                    title="重置到初始居中视图">
              重置视图
            </button>
          </div>
          <div class="text-[10px] text-center text-zinc-500 mt-2">推荐后仍可继续手动微调，实时看到 Depth 效果。调整会同步右侧所有尺寸。</div>
        </div>

        <div class="text-xs text-zinc-500 px-1">
          当前 framing 会同步影响右侧所有尺寸结果（锁屏 / 壁纸 / 社交等）
        </div>
      </div>

      <!-- 右侧：其他尺寸 + 导出 -->
      <div class="lg:col-span-7">
        <div class="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="font-medium">其他尺寸结果（实时跟随当前构图）</h2>
              <div class="text-[10px] text-zinc-500">基于你在左侧锁屏编辑器里的 framing 自动生成，适合不同场景直接使用</div>
            </div>
            <button id="export-all" 
                    class="text-sm px-5 py-2 rounded-2xl border border-zinc-700 hover:bg-zinc-950 active:bg-zinc-900">
              全部导出为 PNG
            </button>
          </div>
          <div id="other-sizes" class="grid grid-cols-2 sm:grid-cols-3 gap-4"></div>
        </div>
      </div>
    </div>

    <div class="mt-8 text-center text-[10px] text-zinc-600">
      参考 iOS 主体感知构图 + Depth Effect 分层 · 纯客户端 · <span class="font-mono">smartcrop.js</span> 提供智能裁剪
    </div>
  </div>
`

const engine = new CropEngine()
let currentOriginal: HTMLImageElement | null = null
let currentLockCanvas: HTMLCanvasElement | null = null

// 事件绑定
const uploadZone = document.getElementById('upload-zone')!
const fileInput = document.getElementById('file-input') as HTMLInputElement
const autoBtn = document.getElementById('auto-btn')!
const resetBtn = document.getElementById('reset-btn')!
const exportAllBtn = document.getElementById('export-all')!
const guideBtn = document.getElementById('editor-guide-btn')!
const guideDiv = document.getElementById('editor-guide')!

if (guideBtn && guideDiv) {
  guideBtn.addEventListener('click', () => {
    guideDiv.classList.toggle('hidden')
    guideBtn.textContent = guideDiv.classList.contains('hidden') ? '使用指南' : '隐藏指南'
  })
}

uploadZone.addEventListener('click', () => fileInput.click())
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('border-blue-500', 'bg-zinc-950') })
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('border-blue-500', 'bg-zinc-950'))
uploadZone.addEventListener('drop', e => {
  e.preventDefault()
  uploadZone.classList.remove('border-blue-500', 'bg-zinc-950')
  const f = e.dataTransfer?.files[0]
  if (f) handleFile(f)
})
fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) handleFile(fileInput.files[0])
})

autoBtn.addEventListener('click', async () => {
  if (!currentOriginal) return
  await engine.autoRecommend()
  redrawLockScreen()
  await refreshOtherSizes()
})

resetBtn.addEventListener('click', () => {
  if (!currentOriginal) return
  engine.loadImage(currentOriginal) // 重置为初始 transform
  redrawLockScreen()
  refreshOtherSizes()
})

exportAllBtn.addEventListener('click', async () => {
  if (!currentOriginal) return
  for (const p of PRESETS) {
    const cropped = await engine.getCroppedForPreset(p)
    const a = document.createElement('a')
    a.href = cropped.src
    a.download = `${p.name.replace(/\s+/g, '_')}.png`
    a.click()
  }
})

function handleFile(file: File) {
  const reader = new FileReader()
  reader.onload = (e) => {
    const img = new Image()
    img.onload = async () => {
      currentOriginal = img
      engine.loadImage(img)

      document.getElementById('file-info')!.textContent = `${file.name} · ${img.width}×${img.height}`
      document.getElementById('file-info')!.classList.remove('hidden')

      renderIPhoneFrame()
      await refreshOtherSizes()
    }
    img.src = e.target!.result as string
  }
  reader.readAsDataURL(file)
}

function renderIPhoneFrame() {
  const container = document.getElementById('iphone-container')!
  // 使用 huashu-design ios_frame.jsx 的精确规格构建高保真 iPhone 外壳
  // 参考 iPhone 15 Pro 逻辑尺寸，精确 bezel、Dynamic Island、status bar 安全区、Home Indicator
  container.innerHTML = `
    <div class="ios-frame-wrapper" style="
      display: inline-block;
      padding: 12px;
      background: #000;
      border-radius: 60px;
      box-shadow: 0 0 0 2px #1f2937, 0 20px 60px rgba(0,0,0,0.45);
      position: relative;
    ">
      <div style="
        position: relative;
        border-radius: 48px;
        overflow: hidden;
        background: #000;
        width: 286px;
        height: 608px;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
      ">
        <!-- Dynamic Island 精确 124x36 logical scaled -->
        <div class="dynamic-island" style="
          position: absolute;
          top: 12px;
          left: 50%;
          transform: translateX(-50%);
          width: 105px;
          height: 30px;
          background: #000;
          border-radius: 999px;
          z-index: 30;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1);
        "></div>

        <!-- 画布作为内容区，top 留给 status bar 安全区 (约54px logical) -->
        <canvas id="lock-canvas" width="${LOCK_FRAME.width}" height="${LOCK_FRAME.height}" 
                class="lock-canvas" style="
                  position: absolute;
                  top: 0;
                  left: 0;
                  width: 100%;
                  height: 100%;
                  border-radius: 48px;
                  background: #000;
                  touch-action: none;
                  cursor: grab;
                "></canvas>

        <!-- Home Indicator -->
        <div style="
          position: absolute;
          bottom: 10px;
          left: 50%;
          transform: translateX(-50%);
          width: 120px;
          height: 5px;
          background: rgba(255,255,255,0.5);
          border-radius: 999px;
          z-index: 10;
        "></div>
      </div>
    </div>
  `

  const canvas = document.getElementById('lock-canvas') as HTMLCanvasElement
  currentLockCanvas = canvas

  // 绑定交互
  bindCanvasInteraction(canvas)

  redrawLockScreen()
}

function bindCanvasInteraction(canvas: HTMLCanvasElement) {
  let isDragging = false
  let lastX = 0, lastY = 0

  const onMove = (clientX: number, clientY: number) => {
    if (!isDragging) return
    const dx = clientX - lastX
    const dy = clientY - lastY
    const t = engine.getTransform()
    engine.updateTransform({ tx: t.tx + dx * 1.6, ty: t.ty + dy * 1.6 })
    lastX = clientX
    lastY = clientY
    redrawLockScreen()
    refreshOtherSizes() // 联动其他尺寸（可节流）
  }

  canvas.addEventListener('mousedown', (e) => {
    isDragging = true
    lastX = e.clientX
    lastY = e.clientY
    canvas.style.cursor = 'grabbing'
  })

  window.addEventListener('mouseup', () => {
    isDragging = false
    if (canvas) canvas.style.cursor = 'grab'
  })

  canvas.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY))

  // 滚轮缩放
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    const t = engine.getTransform()
    const factor = e.deltaY < 0 ? 1.08 : 0.925
    engine.updateTransform({ scale: t.scale * factor })
    redrawLockScreen()
    refreshOtherSizes()
  }, { passive: false })

  // 触摸支持（简单版）
  let lastTouchDist = 0
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isDragging = true
      lastX = e.touches[0].clientX
      lastY = e.touches[0].clientY
    } else if (e.touches.length === 2) {
      lastTouchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
    }
  })

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault()
    if (e.touches.length === 1 && isDragging) {
      onMove(e.touches[0].clientX, e.touches[0].clientY)
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const t = engine.getTransform()
      const factor = dist > lastTouchDist ? 1.035 : 0.965
      engine.updateTransform({ scale: t.scale * factor })
      lastTouchDist = dist
      redrawLockScreen()
      refreshOtherSizes()
    }
  }, { passive: false })

  canvas.addEventListener('touchend', () => { isDragging = false })
}

function redrawLockScreen() {
  if (!currentLockCanvas) return
  engine.draw(currentLockCanvas)
}

async function refreshOtherSizes() {
  const container = document.getElementById('other-sizes')!
  container.innerHTML = ''

  if (!currentOriginal) return

  for (const p of PRESETS) {
    if (p.isLock) continue // 锁屏已经主视图展示

    try {
      const cropped = await engine.getCroppedForPreset(p)
      const card = document.createElement('div')
      card.className = `preset-card bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden cursor-pointer`
      card.innerHTML = `
        <div class="aspect-[${p.width}/${p.height}] bg-black flex items-center justify-center overflow-hidden">
          <img src="${cropped.src}" class="max-w-full max-h-full object-contain" />
        </div>
        <div class="px-3 py-2 text-xs flex justify-between items-center">
          <span>${p.name}</span>
          <span class="text-zinc-500 font-mono">${p.width}×${p.height}</span>
        </div>
      `
      card.onclick = () => {
        const a = document.createElement('a')
        a.href = cropped.src
        a.download = `${p.name.replace(/\s/g, '_')}.png`
        a.click()
      }
      container.appendChild(card)
    } catch (err) {
      console.warn('生成尺寸失败', p.name, err)
    }
  }
}

console.log('%c[PhotoAdv] 前端已就绪（Vite + smartcrop + Canvas 交互）', 'color:#3b82f6')
