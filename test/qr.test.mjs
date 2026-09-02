import test from 'node:test'
import assert from 'node:assert/strict'

import { generateQRMatrix, generateQRSvg } from '../lib/qr.js'

test('генерация матрицы QR-кода для короткой строки', () => {
  const matrix = generateQRMatrix('hello')
  assert.ok(Array.isArray(matrix))
  assert.ok(matrix.length >= 21)
  assert.equal(typeof matrix[0][0], 'boolean')
})

test('генерация матрицы для URL с токеном аутентификации', () => {
  const url = 'https://dsh.local:3088/?token=0123456789abcdef0123456789abcdef'
  const matrix = generateQRMatrix(url)
  assert.ok(Array.isArray(matrix))
  assert.ok(matrix.length > 21)
  // Finder patterns (top-left: 7x7)
  assert.equal(matrix[0][0], true)
  assert.equal(matrix[0][6], true)
  assert.equal(matrix[6][0], true)
  assert.equal(matrix[6][6], true)
})

test('генерация SVG содержит валидные теги и размеры', () => {
  const url = 'https://192.168.1.50:3088/'
  const svg = generateQRSvg(url, { size: 300, dark: '#111', light: '#eee' })
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'))
  assert.ok(svg.includes('width="300"'))
  assert.ok(svg.includes('height="300"'))
  assert.ok(svg.includes('fill="#eee"'))
  assert.ok(svg.includes('fill="#111"'))
  assert.ok(svg.includes('<path d="'))
  assert.ok(svg.endsWith('</svg>'))
})
