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
          <h2 class="font-medium mb-4">上传照片</h2>
          <div id="upload-zone" 
               class="border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-2xl p-10 text-center cursor-pointer transition-colors active:bg-zinc-950">
            <div class="text-4xl mb-3">📷</div>
            <div class="font-medium">拖拽或点击上传</div>
            <div class="text-xs text-zinc-500 mt-1">JPG / PNG / WebP 等</div>
            <input type="file" id="file-input" accept="image/*" class="hidden" />
          </div>
          <div id="file-info" class="mt-3 text-sm text-emerald-400 hidden"></div>
        </div>

        <div class="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
          <div class="flex items-center justify-between mb-3">
            <h2 class="font-medium">iPhone 锁屏 · 实时编辑</h2>
            <div class="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">拖拽平移 / 滚轮缩放</div>
          </div>
          <div id="iphone-container" class="flex justify-center bg-black/40 rounded-2xl p-4 min-h-[340px]"></div>
          
          <div class="grid grid-cols-2 gap-2 mt-4">
            <button id="auto-btn" 
                    class="col-span-1 bg-white hover:bg-zinc-100 active:bg-white text-black font-semibold py-3 rounded-2xl transition active:scale-[0.985]">
              智能推荐
            </button>
            <button id="reset-btn"
                    class="col-span-1 border border-zinc-700 hover:bg-zinc-950 py-3 rounded-2xl transition">
              重置视图
            </button>
          </div>
          <div class="text-[10px] text-center text-zinc-500 mt-2">推荐后仍可继续手动微调，实时看到 Depth 效果</div>
        </div>

        <div class="text-xs text-zinc-500 px-1">
          当前 framing 会同步影响右侧所有尺寸结果
        </div>
      </div>

      <!-- 右侧：其他尺寸 + 导出 -->
      <div class="lg:col-span-7">
        <div class="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="font-medium">其他尺寸结果（实时跟随当前构图）</h2>
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
  container.innerHTML = `
    <div class="iphone-frame w-[310px] h-[620px] relative flex items-center justify-center select-none">
      <canvas id="lock-canvas" width="${LOCK_FRAME.width}" height="${LOCK_FRAME.height}" 
              class="lock-canvas w-[286px] h-[608px] rounded-[52px]"></canvas>
      <div class="dynamic-island text-[8px] text-white/40">Dynamic Island</div>
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
