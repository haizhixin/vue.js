/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson (MPL-1.1 OR Apache-2.0 OR GPL-2.0-or-later)
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import {
  makeMap,
  no
} from 'shared/util'
import {
  isNonPhrasingTag
} from 'web/compiler/util'
import {
  unicodeRegExp
} from 'core/util/lang'

// Regular Expressions for parsing tags and attributes
// \s 匹配空格 *匹配0个以上 . 匹配单个字符除了回车符\r 和换行符\n
// + 至少匹配一个
// ? 没有或者一个
// ()捕获和分组 这部分匹配到的结果会作为一个分组返回出来https://juejin.im/post/5aa797076fb9a028dc40b164
// []中的^ 是非得意思 匹配非[]中的字符
//[^\/]  “表示后面紧非 / 的字符。
// 匹配普通标签属性
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/

// 匹配动态标签属性
const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/

//source属性 返回用于返回模式匹配所用到的文本，不包括正则表达式直接量使用的界定符 也不包括 g m i
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
// 开始标签的开头部分
const startTagOpen = new RegExp(`^<${qnameCapture}`)
// 开始标签的结尾部分 > 或者/>自闭合标签
const startTagClose = /^\s*(\/?)>/
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being passed as HTML comment when inlined in page
const comment = /^<!\--/
const conditionalComment = /^<!\[/

// Special Elements (can contain anything)
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n', //换行符
  '&#9;': '\t', // Tab的下一个指定位置 制表符
  '&#39;': "'"
}
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g

// #5992
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

function decodeAttr(value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

export function parseHTML(html, options) {
  const stack = []
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  let index = 0
  let last, lastTag
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    if (!lastTag || !isPlainTextElement(lastTag)) {
      let textEnd = html.indexOf('<')
      if (textEnd === 0) {
        // Comment:
        if (comment.test(html)) {
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            // 注释的钩子函数可以通过选项来配置只有options.shouldKeepComment为真是才会触发注释的钩子函数
            // 否则只截取字符串
            if (options.shouldKeepComment) {
              options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3)
            }
            // 截取字符串
            advance(commentEnd + 3)
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:
        // 匹配结束标签
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          // 如果有匹配值做两件事
          const curIndex = index
          //一截取模版
          advance(endTagMatch[0].length)
          //二,触发钩子函数
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag:
        // 判断剩余模版是否符合开始标签的规则只需要调用 parseStartTag(),它会解析开始标签如果返回undefine则说明它不符合开始标签的规则
        // 如果有返回结果 把解析出来的结果取出并调用开始标签的钩子函数
        const startTagMatch = parseStartTag()
        // 如果startTagMatch有返回值即为形式如下
        // {
        //   tagName:"div",
        //   attrs:[[
        //     ' class="box"', 'class', '=' null,null,null],
        //   ],[' id="el"','id','=','el',null,null]]
        // }
        if (startTagMatch) {
          // handleStartTag函数的目的是把tagName attrs unary等数据取出然后调用钩子函数将这些数据放到参数中
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next
      if (textEnd >= 0) {
        rest = html.slice(textEnd)
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          next = rest.indexOf('<', 1)
          if (next < 0) break
          textEnd += next
          rest = html.slice(textEnd)
        }
        text = html.substring(0, textEnd)
      }

      if (textEnd < 0) {
        text = html
      }

      if (text) {
        advance(text.length)
      }

      if (options.chars && text) {
        options.chars(text, index - text.length, index)
      }
    } else {
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, {
          start: index + html.length
        })
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag()

  function advance(n) {
    index += n
    html = html.substring(n)
  }


  // 截取开始标签,并解析其属性以及自闭合标签
  // 开始标签包括标签名,属性和结尾
  function parseStartTag() {
    const start = html.match(startTagOpen)

    // match如果匹配不到就返回null 匹配到 match==["<div","div",index:0,input:"<div></div>"]
    // 它匹配的是开始标签的一部分 不包括 属性 和结尾
    if (start) {
      const match = {
        tagName: start[1], //标签名
        attrs: [],
        start: index // 开始位置
      }
      advance(start[0].length)
      // 截取开始标签后 html就是这样的形式:' class="box" id="el"></div>'
      let end, attr
      //  不符合开始标签的结尾部分 且符合标签属性的特征
      while (!(end = html.match(startTagClose)) && (attr = html.match(dynamicArgAttribute) || html.match(attribute))) {
        // 记录属性在html中的开始位置
        attr.start = index
        advance(attr[0].length)
        // 记录属性在html中的结束位置
        attr.end = index
        match.attrs.push(attr)
      }
      // 解析完标签属性后 目前模板是'></div>' 或者/>自闭合标签
      // 匹配到标签的结尾部分
      if (end) {
        // 如果匹配到自闭合标签end[1]为 正则表达式中（）的分组项 / 匹配不上为""
        match.unarySlash = end[1]
        advance(end[0].length)
        // 标记结束位置
        match.end = index
        return match
      }
    }
  }

  function handleStartTag(match) {
    // 获取标签名
    const tagName = match.tagName
    // 是否是自闭合标签
    const unarySlash = match.unarySlash

    if (expectHTML) {
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    const unary = isUnaryTag(tagName) || !!unarySlash

    const l = match.attrs.length
    const attrs = new Array(l)
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      const value = args[3] || args[4] || args[5] || ''
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href' ?
        options.shouldDecodeNewlinesForHref :
        options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)
      }
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        attrs[i].end = args.end
      }
    }

    if (!unary) {
      stack.push({
        tag: tagName,
        lowerCasedTag: tagName.toLowerCase(),
        attrs: attrs,
        start: match.start,
        end: match.end
      })
      lastTag = tagName
    }

    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  function parseEndTag(tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      pos = 0
    }

    if (pos >= 0) {
      // Close all the open elements, up the stack
      for (let i = stack.length - 1; i >= pos; i--) {
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`, {
              start: stack[i].start,
              end: stack[i].end
            }
          )
        }
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag
    } else if (lowerCasedTagName === 'br') {
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') {
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
