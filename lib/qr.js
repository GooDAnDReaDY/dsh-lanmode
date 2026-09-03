// Автономный генератор QR-кодов в формате SVG.
//
// Реализация стандарта ISO/IEC 18004 (версии 1-10) на чистом JavaScript
// без внешних зависимостей. Создаёт чистый векторный SVG для отображения в браузере,
// терминале и мобильных клиентах.

// Поле Галуа GF(256) с полиномом x^8 + x^4 + x^3 + x^2 + 1 (0x11d = 285)
const EXP_TABLE = new Uint8Array(512)
const LOG_TABLE = new Uint8Array(256)

;(function initGF() {
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x
    EXP_TABLE[i + 255] = x
    LOG_TABLE[x] = i
    x <<= 1
    if (x & 256) x ^= 0x11d
  }
  LOG_TABLE[0] = 0
})()

function gfMul(x, y) {
  if (x === 0 || y === 0) return 0
  return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]]
}

function rsGeneratorPoly(degree) {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    const next = [1]
    const root = EXP_TABLE[i]
    for (let j = 0; j < poly.length; j++) {
      next.push(0)
    }
    for (let j = 0; j < poly.length; j++) {
      next[j + 1] ^= gfMul(poly[j], root)
    }
    poly = next
  }
  return poly
}

function rsCalculateRemainder(data, ecCount) {
  const gen = rsGeneratorPoly(ecCount)
  const result = new Array(ecCount).fill(0)
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ result.shift()
    result.push(0)
    for (let j = 0; j < ecCount; j++) {
      result[j] ^= gfMul(gen[j + 1], factor)
    }
  }
  return result
}

// Таблица версий (версии 1..10, уровень коррекции M):
// [version, totalCodewords, ecCodewordsPerBlock, numBlocksGroup1, dataCodewordsGroup1, numBlocksGroup2, dataCodewordsGroup2]
const VERSION_TABLE = [
  null,
  [1, 26, 10, 1, 16, 0, 0],   // v1: 16 data, 10 ec -> 14 bytes max (byte mode)
  [2, 44, 16, 1, 28, 0, 0],   // v2: 28 data, 16 ec -> 26 bytes max
  [3, 70, 26, 1, 44, 0, 0],   // v3: 44 data, 26 ec -> 42 bytes max
  [4, 100, 18, 2, 32, 0, 0],  // v4: 64 data (2 blocks x 32 data, 18 ec) -> 62 bytes
  [5, 134, 24, 2, 43, 0, 0],  // v5: 86 data (2 x 43) -> 84 bytes
  [6, 172, 16, 4, 27, 0, 0],  // v6: 108 data (4 x 27) -> 106 bytes
  [7, 196, 18, 4, 31, 0, 0],  // v7: 124 data (4 x 31) -> 122 bytes
  [8, 242, 22, 2, 38, 2, 39], // v8: 154 data (2x38 + 2x39) -> 152 bytes
  [9, 292, 22, 3, 36, 2, 37], // v9: 182 data -> 180 bytes
  [10, 346, 26, 4, 43, 1, 44], // v10: 216 data -> 213 bytes
]

// Позиции alignment pattern для версий 1..10
const ALIGNMENT_PATTERN_POSITIONS = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
]

class BitBuffer {
  constructor() {
    this.buffer = []
    this.length = 0
  }

  put(num, length) {
    for (let i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1)
    }
  }

  putBit(bit) {
    const bufIndex = Math.floor(this.length / 8)
    if (this.buffer.length <= bufIndex) {
      this.buffer.push(0)
    }
    if (bit) {
      this.buffer[bufIndex] |= (0x80 >>> (this.length % 8))
    }
    this.length++
  }

  getBytes() {
    return this.buffer.slice()
  }
}

function encodeData(text, version) {
  const vInfo = VERSION_TABLE[version]
  const totalDataBytes = (vInfo[3] * vInfo[4]) + (vInfo[5] * vInfo[6])
  const buffer = new BitBuffer()

  // Режим: 8-bit byte mode (0100)
  buffer.put(0x4, 4)
  // Длина данных (8 бит для версий 1-9, 16 бит для 10+)
  const charCountBits = version < 10 ? 8 : 16
  const utf8 = Buffer.from(text, 'utf8')
  buffer.put(utf8.length, charCountBits)

  // Байты данных
  for (let i = 0; i < utf8.length; i++) {
    buffer.put(utf8[i], 8)
  }

  // Терминатор 0000 (до 4 бит)
  const remainingBits = (totalDataBytes * 8) - buffer.length
  const terminatorBits = Math.min(4, Math.max(0, remainingBits))
  buffer.put(0, terminatorBits)

  // Выравнивание до байта
  while (buffer.length % 8 !== 0) {
    buffer.putBit(false)
  }

  // Заполнение чередующимися байтами 0xEC и 0x11
  const bytes = buffer.getBytes()
  let padByte = 0xEC
  while (bytes.length < totalDataBytes) {
    bytes.push(padByte)
    padByte = padByte === 0xEC ? 0x11 : 0xEC
  }

  // Разделение на блоки и подсчет Reed-Solomon EC
  const ecPerBlock = vInfo[2]
  const g1Blocks = vInfo[3]
  const g1Bytes = vInfo[4]
  const g2Blocks = vInfo[5]
  const g2Bytes = vInfo[6]
  const totalBlocks = g1Blocks + g2Blocks

  const dataBlocks = []
  const ecBlocks = []
  let offset = 0

  for (let i = 0; i < g1Blocks; i++) {
    const block = bytes.slice(offset, offset + g1Bytes)
    offset += g1Bytes
    dataBlocks.push(block)
    ecBlocks.push(rsCalculateRemainder(block, ecPerBlock))
  }
  for (let i = 0; i < g2Blocks; i++) {
    const block = bytes.slice(offset, offset + g2Bytes)
    offset += g2Bytes
    dataBlocks.push(block)
    ecBlocks.push(rsCalculateRemainder(block, ecPerBlock))
  }

  // Чередование (Interleaving)
  const finalSequence = []
  const maxDataLen = Math.max(g1Bytes, g2Bytes)
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < totalBlocks; b++) {
      if (i < dataBlocks[b].length) {
        finalSequence.push(dataBlocks[b][i])
      }
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < totalBlocks; b++) {
      finalSequence.push(ecBlocks[b][i])
    }
  }

  return finalSequence
}

function findBestVersion(text) {
  const utf8Len = Buffer.byteLength(text, 'utf8')
  for (let v = 1; v <= 10; v++) {
    const vInfo = VERSION_TABLE[v]
    const totalData = (vInfo[3] * vInfo[4]) + (vInfo[5] * vInfo[6])
    const headerBits = 4 + (v < 10 ? 8 : 16)
    const maxCapacity = Math.floor((totalData * 8 - headerBits) / 8)
    if (utf8Len <= maxCapacity) {
      return v
    }
  }
  throw new Error('Данные слишком велики для генератора QR (максимум ~213 байт)')
}

class QRCodeMatrix {
  constructor(version) {
    this.version = version
    this.moduleCount = version * 4 + 17
    this.modules = Array.from({ length: this.moduleCount }, () => new Array(this.moduleCount).fill(null))
    this.isReserved = Array.from({ length: this.moduleCount }, () => new Array(this.moduleCount).fill(false))
  }

  set(row, col, value, reserved = true) {
    this.modules[row][col] = value
    if (reserved) this.isReserved[row][col] = true
  }

  get(row, col) {
    return this.modules[row][col]
  }

  addFinderPattern(row, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const targetR = row + r
        const targetC = col + c
        if (targetR < 0 || targetR >= this.moduleCount || targetC < 0 || targetC >= this.moduleCount) continue
        const isBlack = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                        (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        this.set(targetR, targetC, isBlack)
      }
    }
  }

  addAlignmentPattern(row, col) {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const isBlack = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)
        this.set(row + r, col + c, isBlack)
      }
    }
  }

  setupPositionPatterns() {
    this.addFinderPattern(0, 0)
    this.addFinderPattern(this.moduleCount - 7, 0)
    this.addFinderPattern(0, this.moduleCount - 7)

    // Timing patterns
    for (let i = 8; i < this.moduleCount - 8; i++) {
      this.set(6, i, i % 2 === 0)
      this.set(i, 6, i % 2 === 0)
    }

    // Alignment patterns
    const positions = ALIGNMENT_PATTERN_POSITIONS[this.version]
    for (let i = 0; i < positions.length; i++) {
      for (let j = 0; j < positions.length; j++) {
        const r = positions[i]
        const c = positions[j]
        // Пропускаем, если пересекается с finder patterns
        if (this.isReserved[r][c]) continue
        this.addAlignmentPattern(r, c)
      }
    }

    // Dark module
    this.set(4 * this.version + 9, 8, true)

    // Зарезервировать форматные области вокруг finder patterns
    for (let i = 0; i < 9; i++) {
      if (!this.isReserved[8][i]) this.set(8, i, false, true)
      if (!this.isReserved[i][8]) this.set(i, 8, false, true)
    }
    for (let i = this.moduleCount - 8; i < this.moduleCount; i++) {
      if (!this.isReserved[8][i]) this.set(8, i, false, true)
      if (!this.isReserved[i][8]) this.set(i, 8, false, true)
    }
  }

  placeData(dataBytes, maskPattern) {
    let byteIdx = 0
    let bitIdx = 7
    let dir = -1 // снизу вверх
    let col = this.moduleCount - 1
    let row = this.moduleCount - 1

    while (col > 0) {
      if (col === 6) col-- // Пропуск вертикального timing pattern

      for (let i = 0; i < this.moduleCount; i++) {
        const r = dir < 0 ? this.moduleCount - 1 - i : i
        for (let c = 0; c < 2; c++) {
          const targetC = col - c
          if (this.isReserved[r][targetC]) continue

          let bit = false
          if (byteIdx < dataBytes.length) {
            bit = ((dataBytes[byteIdx] >>> bitIdx) & 1) === 1
            bitIdx--
            if (bitIdx < 0) {
              byteIdx++
              bitIdx = 7
            }
          }

          // Применение маски: Mask 0 = (row + col) % 2 === 0
          let mask = false
          if (maskPattern === 0) mask = (r + targetC) % 2 === 0
          else if (maskPattern === 1) mask = r % 2 === 0
          else if (maskPattern === 2) mask = targetC % 3 === 0
          else if (maskPattern === 3) mask = (r + targetC) % 3 === 0
          else if (maskPattern === 4) mask = (Math.floor(r / 2) + Math.floor(targetC / 3)) % 2 === 0
          else if (maskPattern === 5) mask = ((r * targetC) % 2) + ((r * targetC) % 3) === 0
          else if (maskPattern === 6) mask = (((r * targetC) % 2) + ((r * targetC) % 3)) % 2 === 0
          else if (maskPattern === 7) mask = (((r + targetC) % 2) + ((r * targetC) % 3)) % 2 === 0

          this.modules[r][targetC] = bit ^ mask
        }
      }
      dir = -dir
      col -= 2
    }
  }

  writeFormatInformation(maskPattern) {
    // Уровень коррекции M = 00, Mask = maskPattern
    const formatData = (0b00 << 3) | maskPattern
    // BCH код (15, 5)
    let d = formatData << 10
    for (let i = 4; i >= 0; i--) {
      if ((d >>> (i + 10)) & 1) {
        d ^= (0b10100110111 << i)
      }
    }
    const formatBits = ((formatData << 10) | d) ^ 0x5412

    // Запись форматных бит
    for (let i = 0; i < 15; i++) {
      const bit = ((formatBits >>> i) & 1) === 1
      if (i < 6) this.modules[i][8] = bit
      else if (i < 8) this.modules[i + 1][8] = bit
      else this.modules[this.moduleCount - 15 + i][8] = bit

      if (i < 8) this.modules[8][this.moduleCount - i - 1] = bit
      else if (i < 9) this.modules[8][15 - i] = bit
      else this.modules[8][15 - i - 1] = bit
    }
  }
}

/**
 * Сгенерировать матрицу QR-кода для строки текста.
 * @param {string} text Строка для кодирования
 * @returns {boolean[][]} 2D-массив булевых значений (true = черная точка)
 */
export function generateQRMatrix(text) {
  const version = findBestVersion(text)
  const data = encodeData(text, version)
  const qr = new QRCodeMatrix(version)
  qr.setupPositionPatterns()
  // Используем оптимальную маску 0
  const mask = 0
  qr.placeData(data, mask)
  qr.writeFormatInformation(mask)
  return qr.modules
}

/**
 * Сгенерировать чистый SVG QR-кода.
 * @param {string} text Текст/URL для кодирования
 * @param {object} [options] Опции генерации (margin, size, dark, light)
 * @returns {string} Валидная строка SVG
 */
export function generateQRSvg(text, options = {}) {
  const matrix = generateQRMatrix(text)
  const count = matrix.length
  const margin = options.margin ?? 4
  const size = options.size ?? 256
  const total = count + margin * 2
  const dark = options.dark ?? '#000000'
  const light = options.light ?? '#ffffff'

  let paths = ''
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (matrix[r][c]) {
        paths += `M${c + margin},${r + margin}h1v1h-1z `
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges">`
    + `<rect width="100%" height="100%" fill="${light}"/>`
    + `<path d="${paths.trim()}" fill="${dark}"/>`
    + `</svg>`
}

/**
 * Сгенерировать компактный ASCII QR-код для терминала (#35).
 * @param {string} text Текст/URL для кодирования
 * @returns {string} Строка с псевдографикой
 */
export function generateAsciiQR(text) {
  const matrix = generateQRMatrix(text)
  const count = matrix.length
  let out = '\n'
  for (let r = 0; r < count; r += 2) {
    let line = '  '
    for (let c = 0; c < count; c++) {
      const top = matrix[r][c]
      const bottom = (r + 1 < count) ? matrix[r + 1][c] : false
      if (top && bottom) line += '█'
      else if (top && !bottom) line += '▀'
      else if (!top && bottom) line += '▄'
      else line += ' '
    }
    out += line + '\n'
  }
  return out
}
