import fs from 'node:fs'
import path from 'node:path'
import type { ExtensionContext } from 'vscode'
import { Range, commands, window, workspace } from 'vscode'

function readScssFile(filePath: string) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8')
    return fileContent
  }
  catch (error) {
    // eslint-disable-next-line no-console
    console.log(`Error reading SCSS file: ${error}`)
    return null
  }
}

function expandShortHex(hex: string) {
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
  }
  return hex
}

function extractScssVariables(scssContent: string) {
  const variableMap = new Map()
  // eslint-disable-next-line regexp/no-super-linear-backtracking
  const variablePattern = /\$([\w-]+):\s*([^;]+);/g
  let match

  // eslint-disable-next-line no-cond-assign
  while ((match = variablePattern.exec(scssContent)) !== null) {
    const variableName = match[1]
    const variableValue = match[2].trim()
    variableMap.set(variableName, variableValue)
  }

  return variableMap
}

function replaceMagicValuesWithVariables(documentContent: string, variablesMap: Map<string, string>) {
  let updatedContent = documentContent

  // 反转变量 Map，方便通过值查找变量名
  const valueToVariableMap = new Map()
  for (const [key, value] of variablesMap.entries()) {
    valueToVariableMap.set(value, `$${key}`)
  }

  // 匹配魔法值的正则表达式
  const magicValuePattern = /#[0-9a-f]{3,6}/gi
  updatedContent = updatedContent.replace(magicValuePattern, (match) => {
    const expandedMatch = expandShortHex(match.toLowerCase())
    return valueToVariableMap.get(expandedMatch) || match
  })

  return updatedContent
}

function getActiveFileWorkspaceFolder() {
  const activeEditor = window.activeTextEditor
  if (!activeEditor) {
    window.showErrorMessage('No active editor found.')
    return null
  }

  const activeFileUri = activeEditor.document.uri
  const workspaceFolder = workspace.getWorkspaceFolder(activeFileUri)
  return workspaceFolder ? workspaceFolder.uri.fsPath : null
}

export function activate(context: ExtensionContext) {
  const config = workspace.getConfiguration('scssColors')
  const colorConfigPath = config.get('variablesPath') as string

  const disposable = commands.registerCommand('scssFormatter.format', async () => {
    if (!colorConfigPath) {
      window.showErrorMessage('config not found, should set scssColors.variablesPath in settings.json')
      return
    }

    const workspaceFolder = getActiveFileWorkspaceFolder()

    if (!workspaceFolder) {
      window.showErrorMessage('No workspace folder found.')
      return
    }

    const variablesPath = path.join(workspaceFolder, colorConfigPath)
    const scssContent = readScssFile(variablesPath)
    if (!scssContent) {
      window.showErrorMessage('Error reading SCSS file.')
      return
    }

    const scssVariables = extractScssVariables(scssContent)

    const editor = window.activeTextEditor
    if (!editor) {
      return
    }
    const document = editor.document
    if (document.languageId !== 'scss') {
      window.showErrorMessage('This command can only be used on SCSS files.')
      return
    }

    const documentContent = document.getText()
    const updatedContent = replaceMagicValuesWithVariables(documentContent, scssVariables)

    await editor.edit((editBuilder) => {
      const entireRange = new Range(
        document.positionAt(0),
        document.positionAt(documentContent.length),
      )
      editBuilder.replace(entireRange, updatedContent)
    })

    // 保存更新后的文档
    await document.save()
  })

  context.subscriptions.push(disposable)
}

export function deactivate() {

}
