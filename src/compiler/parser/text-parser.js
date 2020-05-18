/* @flow */

import { cached } from 'shared/util'
import { parseFilters } from './filter-parser'

const defaultTagRE = /\{\{((?:.|\r?\n)+?)\}\}/g
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g

const buildRegex = cached(delimiters => {
    const open = delimiters[0].replace(regexEscapeRE, '\\$&')
    const close = delimiters[1].replace(regexEscapeRE, '\\$&')
    return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
})

type TextParseResult = {
    expression: string,
    tokens: Array < string | { '@binding': string } >
}

export function parseText(
    text: string,
    delimiters ? : [string, string]
): TextParseResult | void {
    const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE
    if (!tagRE.test(text)) {
        return
    }
    const tokens = []
    const rawTokens = []
    let lastIndex = tagRE.lastIndex = 0
    let match, index, tokenValue
    // tagRE.exec(text)匹配文本表达式
    while ((match = tagRE.exec(text))) {
        // 匹配文本在字符串中的第一个位置
        index = match.index
        // push text token
        if (index > lastIndex) {
            rawTokens.push(tokenValue = text.slice(lastIndex, index))
            tokens.push(JSON.stringify(tokenValue))
        }
        // tag token
        const exp = parseFilters(match[1].trim())
        tokens.push(`_s(${exp})`)
        rawTokens.push({ '@binding': exp })
        lastIndex = index + match[0].length
    }
    if (lastIndex < text.length) {
        rawTokens.push(tokenValue = text.slice(lastIndex))
        tokens.push(JSON.stringify(tokenValue))
    }
    return {
        expression: tokens.join('+'),
        tokens: rawTokens
    }
    // 如果字符串为 abc{{name}}def
    //最终返回值为
    // return {
    //   expression: "'abc'+_s(name)+'def'",
    //   tokens: [
    //     'abc',
    //     {
    //       '@binding': '_s(name)'
    //     },
    //     'def'
    //   ]
    // }
}
