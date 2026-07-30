export function downloadFile(
  content: BlobPart,
  filename: string,
  type = 'application/octet-stream',
): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename

  try {
    link.click()
  }
  finally {
    URL.revokeObjectURL(url)
  }
}
