/* @flow */

// \w包含单词字符(a-z A-Z 0-9 以及下划线_)
// validDivisionCharRE正则表达式匹配 字母 数字 ) . + - _ $ ]之一
const validDivisionCharRE = /[\w).+\-_$\]]/
// 过滤器以管道符 | 分隔 但是不能把所有在绑定属性的值中出现的 | 都作为过滤器管道符
// 以下五种情况 不是过滤器管道符
{
    /*
    1,<div :key="'id | featId'"></div>  <!-- 单引号内的管道符 -->
    2,<div :key='"id | featId"'></div>  <!-- 双引号内的管道符 -->
    3,<div :key="`id | featId`"></div>  <!-- 模板字符串内的管道符 -->
    4,<div :key="/id|featId/.test(id).toString()"></div>  <!-- 正则表达式内的管道符 -->
    5,<div :key="id || featId"></div>  <!-- 逻辑或运算符内的管道符 --> */
}
// 除了以上五种情况 存在冲突的还有 按位或运算符 它是位运算中的一个运算符
// 这时我们必须做出选择：既然你希望管道符用来作为过滤器的分界线那就抛弃它按位或运算符的意义。
// 正则表达式<div :key="/id|featId/.test(id).toString()"></div>  <!-- 正则表达式内的管道符 -->这种情况下的管道符是最难判断的
// 因为我们很难识别出一个正则表达式 / 也有除法的意思,难点在于我们如何区分它是一个除法还是 正则
export function parseFilters(exp: string): string {
    let inSingle = false // 用来标识当前读取的字符是否在由单引号包裹的字符串中
    let inDouble = false // 用来标识当前读取的字符是否在由双引号包裹的字符串中
    let inTemplateString = false //用来标识当前读取的字符是否在模板字符串中
    let inRegex = false //用来标识当前读取的字符是否在正则表达式中
    let curly = 0 //{} 每遇到一个左花括号 curly就会加1每遇到一个右花括号curly就会减1
    let square = 0 // []每遇到一个左方括号 square就会加1每遇到一个右方括号square就会减1
    let paren = 0 // ()每遇到一个左圆括号 paren就会加1每遇到一个右圆括号就会减1
    // parseFilters解析属性值字符串时如果遇到一个管道符,该管道符应不应该作为过滤器的分界线
    //还要看curly square paren这三个值是否为0 如果任何一个不为0说明 管道符存在于 () 或[]或{}之中 此时不能作为过滤器的分界线
    let lastFilterIndex = 0 //属性值字符串的索引用来标识过滤器管道符在属性值字符串中的位置

    // c为当前读入字符对应的ASCII码 pre为当前读入字符的前一个字符对应的ASCII码
    // i为当前读入字符的位置索引 expression是parseFilters函数的返回值
    // filters是一个数组保存着所有过滤器的函数名
    let c, prev, i, expression, filters

    //通过循环 把传入的属性值字符串作为字符流从头到尾挨个读取
    for (i = 0; i < exp.length; i++) {
        //把前一个读取字符对应的ASCII码赋值给prev
        prev = c
        // 保存当前读取字符对应的ASCII码
        c = exp.charCodeAt(i)
        if (inSingle) {
            // inSingle为真 说明当前读取的字符存在于由单引号包裹的字符串内，则会执行这里的代码
            // 0x27 0x5C两个十六进制的数字 实际上就是字符的ASCII值
            // 其中0x27是指 单引号'对应的ASCII值  0x5C是指反斜杠\对应的ASCII值
            // 当前字符是单引号 当前字符的前一个字符不是反斜杠 因为反斜杠具有转义作用 说明当前字符是字符串的结束
            if (c === 0x27 && prev !== 0x5C) inSingle = false
        } else if (inDouble) {
            // inDouble为真 说明当前读取的字符存在于由双引号包裹的字符串内，则会执行这里的代码
            // 0x22是指双引号"对应的ASCII值
            // 当前字符是单引号 当前字符的前一个字符不是反斜杠 说明当前字符是字符串的结束
            if (c === 0x22 && prev !== 0x5C) inDouble = false
        } else if (inTemplateString) {
            // inTemplateString为真 说明当前读取的字符存在于模板字符串内，则会执行这里的代码
            // 0x60是`模板字符串对应的ASCII值
            // 当前字符是模板字符串 且当前字符的前一个字符不是反斜杠 说明当前字符就是模板字符串的结束 接下来的解析工作已经不处于模板字符串中了
            if (c === 0x60 && prev !== 0x5C) inTemplateString = false
        } else if (inRegex) {
            // inRegex为真 说明当前读取的字符存在于正则表达式内，则会执行这里的代码
            // 0x2f是/字符对应的ASCII值
            // 当前字符是/ 且当前字符的前一个字符不是反斜杠 说明当前字符/就是正则表达式的结束,接下来的解析工作已经不处于正则表达式中
            if (c === 0x2f && prev !== 0x5C) inRegex = false
        } else if (
            // 0x7C是管道符(|)对应的ASCII码
            // 这个判断条件用来检测当前遇到的管道符(|)是否是过滤器的分界线
            // 满足条件
            // 1,当前字符是管道符
            // 2,该字符的后一个字符不能是管道符
            // 3,该字符的前一个字符不能使管道符
            // 当前字符不在()圆括号{}花括号[]方括号中
            c === 0x7C && // pipe
            exp.charCodeAt(i + 1) !== 0x7C &&
            exp.charCodeAt(i - 1) !== 0x7C &&
            !curly && !square && !paren
        ) {
            // 如果当前读取的字符是过滤器的分界线，则会执行这里的代码
            
            if (expression === undefined) {
                //第一次遇到作为过滤器分界线的管道分隔符
                // first filter, end of expression
                // i是当前遇到的管道符的位置索引  i+1是管道符下一个字符的位置索引
                lastFilterIndex = i + 1
                // 对exp字符串进行截取 截取的结束位置刚好是管道符的位置 但不包括管道符 并去掉前后的空格 并把值赋给expression
                //例如<div :key="id | featId"></div>截取后的值是 id 
                expression = exp.slice(0, i).trim()

            } else {
                pushFilter()
            }
        } else {
            // 当不满足以上条件时，执行这里的代码
            switch (c) {
                case 0x22:
                    inDouble = true;
                    break // "
                case 0x27:
                    inSingle = true;
                    break // '
                case 0x60:
                    inTemplateString = true;
                    break // `
                case 0x28:
                    paren++;
                    break // (
                case 0x29:
                    paren--;
                    break // )
                case 0x5B:
                    square++;
                    break // [
                case 0x5D:
                    square--;
                    break // ]
                case 0x7B:
                    curly++;
                    break // {
                case 0x7D:
                    curly--;
                    break // }

                    // 如果当前字符为双引号(")，则将 inDouble 变量的值设置为 true。
                    // 如果当前字符为单引号(‘)，则将 inSingle 变量的值设置为 true。
                    // 如果当前字符为模板字符串的定义字符(`)，则将 inTemplateString 变量的值设置为 true。
                    // 如果当前字符是左圆括号(()，则将 paren 变量的值加一。
                    // 如果当前字符是右圆括号())，则将 paren 变量的值减一。
                    // 如果当前字符是左方括号([)，则将 square 变量的值加一。
                    // 如果当前字符是右方括号(])，则将 square 变量的值减一。
                    // 如果当前字符是左花括号({)，则将 curly 变量的值加一。
                    // 如果当前字符是右花括号(})，则将 curly 变量的值减一。

                    // 判断字符串和模板字符串的环境很简单
                    //难点在于如何判断正则环境 即如何设置inRegex为true
            }

            // 如果遇到的0x2f是一个/ 接下来就要判断是否即将进入正则环境
            if (c === 0x2f) { // /
                // 定义一个变量j 它的值是i-1;也就是说j是当前字符/的上一个字符的索引
                let j = i - 1
                let p
                // find first non-whitespace prev char
                // 找到当前字符/ 前第一个不为空的字符 如果没有找到
                // 包括两种情况:1,/之前的字符全是空格 2,/之前根本就没有字符
                // <div :key="/a/.test('abc')"></div>      <!-- 第一个 `/` 之前就没有字符  -->
                // <div :key=" /a/.test('abc')"></div>  <!-- 第一个 `/` 之前都是空格  -->
                // 以上两种情况第一个/ 说明是正则的开始 而非除法
                for (; j >= 0; j--) {
                    // charAt()返回指定位置的字符
                    p = exp.charAt(j)
                    if (p !== ' ') break
                }
                // 之前没有非空的字符串 或者有非空的字符串 且满足validDivisionCharRE正则表达式说明当前/是正则的开始
                // 匹配 字母 数字 ) . + - _ $ ]
                //也就是说 /前如果有非空字符 但是非空字符不能是 单个 字母 数字 ) . + - _ $ ]其中的任何一个 否则就不能认为是正则
                if (!p || !validDivisionCharRE.test(p)) {
                    inRegex = true
                }
            }
            // 如上代码是一个 if 判断语句，它用来判断当前字符所对应的 ASCII 码是否等于数字 0x2f，其中数字 0x2f 就是字符
            // 所对应的 ASCII 码。我们知道正则表达式就是以字符 开头的，所以当遇到字符 / 时，则说明该字符有可能是正则的开始。
            //但至于到底是不是正则的开始还真不一定，
            //前面我们已经提到过了，字符 / 还有除法的意义。而判断字符 / 到底是正则的开始还是除法却是一件不容易的事情。
            //实际上如上代码根本不足以保证所遇到的字符 / 就是正则表达式，但还是那句话，这对于 Vue 而言已经足够了，
            //我们没必要花大力气在收益很小的地方。
        }
    }
    // for循环结束 i的值是字符串exp的长度
    // <div :key="id | featId"></div>对于它来说 expression的值为id
    // 此时expression有值因此会走else if判断条件
    if (expression === undefined) {
        expression = exp.slice(0, i).trim()
    } else if (lastFilterIndex !== 0) {
        pushFilter()
    }

    function pushFilter() {
        // lastFilterIndex为管道符的下一个字符位置索引
        // i的值是字符串exp的长度
        (filters || (filters = [])).push(exp.slice(lastFilterIndex, i).trim())
        // <div :key="id | featId"></div>对于它来说 exp.slice(lastFilterIndex, i).trim()的值是 featId
        lastFilterIndex = i + 1
    }
    // 经过以上处理之后 expression代表着表达式 filters代表着所有过滤器的名字
//    如 <div :key="id | a | b | c"></div>
// 那么经过解析，变量 expression 的值将是字符串 'id'，且 filters 数组中将包含三个元素：['a', 'b', 'c']。

    if (filters) {
        for (i = 0; i < filters.length; i++) {
            expression = wrapFilter(expression, filters[i])
        }
    }

    return expression
}

function wrapFilter(exp: string, filter: string): string {
    const i = filter.indexOf('(')
    if (i < 0) {
        // _f: resolveFilter
        return `_f("${filter}")(${exp})`
    } else {
        const name = filter.slice(0, i)
        const args = filter.slice(i + 1)
        return `_f("${name}")(${exp}${args !== ')' ? ',' + args : args}`
    }
}
