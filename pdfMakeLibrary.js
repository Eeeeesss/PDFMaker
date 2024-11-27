let pdfFunc = {
    FIELD_FONTSIZE: 10,
    UNDER_TEXT_FONTSIZE: 7,

    // TXT constants:
    FONT: {
        DEJA: 'DejaVuSerifCondensed',
        TIMES: 'TimesNewRoman'
    },
    ALIGNMENT: {
        LEFT: 'left',
        RIGHT: 'right',
        CENTER: 'center',
        JUSTIFY: 'justify',
    },

    //START decorator functions:
    getModel: (...args) => model.playerModel.getModelWithId(...args),
    restGet: (url) => AS.FORMS.ApiUtils.simpleAsyncGet(url),
    // START ckeditor (html) parser:
    PARSER: {
        ckeditor:
            function parseCKEditorToPdfMake(html) {
                let imageArray = {};
                html.replaceAll('\n', '');
                html.replaceAll('\t', '');
                html.replaceAll('\"', '"');

                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                console.log(doc)
                const result = [];

                function rgbToHex(r, g, b) {
                    // parse rgb to html_hex
                    return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
                }

                function rgbStringToHex(string) {
                    // parse string for rgbToHex func
                    if (string.indexOf('rgb(') >= 0) {
                        let rgbVal = string.match(/\d+/g).map(Number);
                        return rgbToHex(rgbVal[0], rgbVal[1], rgbVal[2]);
                    } else if (string === "transparent") {
                        return '#FFFFFF'
                    } else return string
                }

                // Функция для парсинга стилей
                function parseStyles(element) {
                    const style = element.style;
                    const pStyle = element.parentElement.style;
                    const tagName = element.tagName.toLowerCase();
                    const styles = {};

                    element.textContent && element.textContent !== " " && !pStyle?.fontSize && (styles.fontSize = 12);
                    pStyle?.fontSize && (styles.fontSize = parseInt(pStyle.fontSize, 10));
                    pStyle?.fontWeight === 'bold' && (styles.bold = true);
                    pStyle?.fontStyle === 'italic' && (styles.italics = true);
                    pStyle?.textDecoration === 'underline' && (styles.decoration = 'underline');
                    pStyle?.textDecoration === 'line-through' && (styles.decoration = 'lineThrough');
                    pStyle?.color && (styles.color = rgbStringToHex(pStyle.color));
                    pStyle?.backgroundColor && (styles.background = rgbStringToHex(pStyle.backgroundColor));
                    pStyle?.textAlign && (styles.alignment = pStyle.textAlign);

                    element.textContent && element.textContent !== " " && !style?.fontSize && (styles.fontSize = 14);
                    style?.fontSize && (styles.fontSize = parseInt(style.fontSize, 10));
                    style?.fontWeight === 'bold' && (styles.bold = true);
                    style?.fontStyle === 'italic' && (styles.italics = true);
                    style?.textDecoration === 'underline' && (styles.decoration = 'underline');
                    style?.textDecoration === 'line-through' && (styles.decoration = 'lineThrough');
                    style?.color && (styles.color = rgbStringToHex(style.color));
                    style?.backgroundColor && (styles.background = rgbStringToHex(style.backgroundColor));
                    style?.textAlign && (styles.alignment = style.textAlign);
                    style?.textAlign === undefined && (styles.alignment = 'justify');

                    return styles;
                }

                // Функция для обработки текстовых узлов и элементов со стилями
                function parseTextAndStyles(element) {
                    const children = element.childNodes;
                    const result = [];

                    children.forEach(child => {
                        if (child.nodeType === Node.TEXT_NODE) {
                            if (child.textContent.trim()) {
                                // const lastItem = result[result.length - 1];
                                // if (lastItem) {
                                //     result[result.length - 1] += child.textContent;
                                // } else {
                                //     result.push({ text: child.textContent, ...parseStyles(child.parentNode) });
                                // }

                                result.push({text: child.textContent || ' ', ...parseStyles(child.parentNode)});
                            }
                        } else if (child.nodeType === Node.ELEMENT_NODE) {
                            const parsedChild = parseElement(child);
                            const styles = parseStyles(child);
                            if (parsedChild.text) {
                                result.push({text: parsedChild.text || ' ', ...styles});
                            } else if (parsedChild.ul || parsedChild.ol || parsedChild.image) {
                                result.push(parsedChild);
                            }
                        }
                    });

                    // Если result содержит только один текстовый узел, возвращаем его напрямую
                    if (result.length === 0) {
                        return ' ';
                    } else if (result.length === 1) {
                        return result[0];
                    }
                    return result;
                }

                // // Функция для обработки параграфов
                // function parseParagraph(element) {
                //     //const textContent = parseTextAndStyles(element);
                //     return { text: parseTextAndStyles(element), ...parseStyles(element) };
                // }

                // Функция для обработки таблиц
                function parseTable(element) {
                    const body = [];
                    const rows = element.querySelectorAll('tr');
                    let widths = []

                    rows.forEach((row, rowIndex) => {
                        const rowData = [];
                        const cells = row.querySelectorAll('td, th');
                        let colIndex = 0;

                        cells.forEach(cell => {
                            while (rowData[colIndex]) {
                                colIndex++;
                            }
                            if (cell?.attributes?.width?.nodeValue) {
                                widths[colIndex] = parseInt(cell.attributes.width.nodeValue) * 0.61;
                            } else {
                                widths[colIndex] = '*';
                            }


                            const cellData = parseElement(cell);

                            const colspan = cell.getAttribute('colspan');
                            const rowspan = cell.getAttribute('rowspan');

                            if (colspan) {
                                cellData.colSpan = parseInt(colspan);
                            }
                            if (rowspan) {
                                cellData.rowSpan = parseInt(rowspan);
                            }

                            rowData[colIndex] = cellData;

                            if (colspan) {
                                for (let i = 1; i < colspan; i++) {
                                    rowData[colIndex + i] = {};
                                }
                            }

                            if (rowspan) {
                                for (let i = 1; i < rowspan; i++) {
                                    if (!body[rowIndex + i]) {
                                        body[rowIndex + i] = [];
                                    }
                                    body[rowIndex + i][colIndex] = {};
                                }
                            }
                            colIndex++;
                        });
                        body.push(rowData);
                    });

                    parseTableBody(widths, body)
                    return {table: {widths, body}};
                }

                function parseTableBody(widths, body) {
                    for (let i = 0; i < body.length; i++) {
                        if (body[i].length !== widths.length) {
                            let lenSurplus = widths.length - body[i].length;
                            for (let j = 0; j < lenSurplus; j++) {
                                body[i].push([])
                            }
                        }
                    }
                }

                // Функция для обработки списков (нумерованных и ненумерованных)
                function parseList(element, isOrdered) {
                    const items = [];
                    let attributes = {}

                    const listItems = element.querySelectorAll('li');
                    listItems.forEach(li => {
                        items.push(parseElement(li) || ' ');
                    });
                    if (element?.attributes?.start) {
                        attributes.start = parseInt(element.attributes.start.nodeValue)
                    }

                    if (listItems[0]?.style) {
                        listItems[0]?.style?.textAlign && (attributes.alignment = listItems[0]?.style.textAlign);
                    }

                    return isOrdered ? {...attributes, ol: items} : {...attributes, ul: items};
                }

                // Функция для обработки изображений
                function parseImage(element) {
                    let keyLen = Object.keys(imageArray).length + 1
                    imageArray['image_' + keyLen] = element.src
                    return {
                        image: 'image_' + keyLen,
                        width: 100, // ширина изображения
                        alignment: element.style.float || 'left'
                    };
                }

                // Функция для обработки строк таблицы
                // function parseTD(element) {
                //     let elData = parseTextAndStyles(element);
                //     let elStyles = parseStyles(element);
                //     if (elData.length === 0) return [];
                //     if (!elData.length) return {...elData, ...elStyles};
                //     for (let i = 0; i < elData.length; i++) {
                //         if (!elData[i].text) {
                //             return {text: elData, ...elStyles};
                //         }
                //     }
                //     return {text: elData, ...elStyles};
                // }
                function parseTD(element) {
    const textContent = element.textContent.trim() || '<br>';
    
    // Прямое добавление текста в ячейку без применения `parseStyles`
    return {
        text: textContent,
        alignment: 'justify', // Можно указать выравнивание текста
        noWrap: false, // Явно разрешить перенос текста
    };
}

                // Функция для обработки стилизованных элементов:
                function parseStyling(element, tagName) {
                    if (tagName === 'strong') element.style.fontWeight = 'bold';
                    if (tagName === 'b') element.style.fontWeight = 'bold'
                    if (tagName === 'em') element.style.fontStyle = 'italic';
                    if (tagName === 'u') element.style.textDecoration = 'underline';
                    if (tagName === 's') element.style.textDecoration = 'line-through';

                    return parseTD(element);
                }

                // Основная функция для обработки элементов
                function parseElement(element) {
                    const tagName = element.tagName.toLowerCase();
                    switch (tagName) {
                        // components:
                        case 'span':
                            return {text: parseTextAndStyles(element), ...parseStyles(element)};
                        case 'p':
                            return {text: parseTextAndStyles(element), ...parseStyles(element)};
                        case 'li':
                            return {text: parseTextAndStyles(element), ...parseStyles(element)};
                        case 'img':
                            debugger
                            return parseImage(element);

                        // containers:
                        case 'table':
                            return parseTable(element);
                        case 'ul':
                        case 'ol':
                            return parseList(element, tagName === 'ol');
                        case 'td':
                            return parseTD(element);

                        // styling:
                        case 'strong':
                        case 'em':
                        case 'u':
                        case 's':
                            return parseStyling(element, tagName);

                        default:
                            return {text: parseTextAndStyles(element), ...parseStyles(element)};
                    }
                }

                // Проход по всем элементам и парсинг
                doc.body.childNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const parsedElement = parseElement(node);
                        if (parsedElement) {
                            result.push(parsedElement);
                        }
                    }
                });

                return [result, imageArray];
            },

        htmlToPDFMake: (html) => {

            const changeFonts = (arr) => {
                for (let i = 0; i < arr.length; i++) {
                    if (arr[i]?.nodeName === "P")
                        arr[i].alignment = "justify";
                    if (arr[i]?.fontSize && arr[i]?.fontSize < 12)
                        arr[i].fontSize = 14;
                    if (arr[i]?.font && arr[i]?.font === "Calibri")
                        arr[i].font = pdfFunc.FONT.TIMES;
                    if (arr[i].text?.constructor)
                        if (arr[i].text.constructor === Array)
                            arr[i].text = changeFonts(arr[i].text);
                }
                return arr;
            }
            html.replaceAll('\n', '');
            html.replaceAll('\t', '');
            html.replaceAll('\"', '"');
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            html = doc.getElementsByTagName("body")[0].innerHTML
            html.replaceAll('\n', '');
            html.replaceAll('\t', '');
            html.replaceAll('\"', '"');
            let result = htmlToPdfmake(html);
            console.log(result)
            // result = changeFonts(result);
            return result;
        }
    },

    //START UTILS functions:
    UTILS: {
        getTextWithComma: (fieldsVal, fieldArr) => {
            return fieldArr
                .map(field => fieldsVal[field])
                .filter(value => value && value !== '')
                .join(', ');
        },

        getFieldsVal: (fields) => {
            let fieldsVal = {};
            fields.forEach((fieldName) => {
                fieldsVal[fieldName] = pdfFunc.getModel(fieldName)?.getAsfData()?.value;
            });
            return fieldsVal
        },

        createObjFromArr: (asfData, idsToFind) => {
            return asfData.reduce((acc, obj) => {
                if (idsToFind.includes(obj.id)) {
                    acc[obj.id] = obj;
                }
                return acc;
            }, {});
        },

        getBlocksFromDyn: (dynTableData, fields) => {
            let resData = []

            for (let i = 0; i < dynTableData.length; i++) {
                for (let j = 0; j < fields.length; j++) {
                    if (dynTableData[i].id.startsWith(fields[j])) {
                        const counter = parseInt(dynTableData[i].id.match(/-b\d+$/)[0].slice(2), 10);
                        if (!resData[counter - 1]) resData[counter - 1] = {}
                        resData[counter - 1][fields[j]] = dynTableData[i]
                    }
                }
            }

            return resData.filter(element => element !== null);
        },

        parseListBoxData: (data) => {
            const items = Object.values(data.items);
            return items.map(item => {
                return {
                    id: item.id.value,
                    name: item.name.translation
                };
            });
        },

        getDynData: (tableId, fields) => {
            let fieldsFromDyn = [];
            let table = pdfFunc.getModel(tableId);

            for (let i = 0; i < table.modelBlocks.length; i++) {
                fieldsFromDyn.push({});
                for (let j = 0; j < table.modelBlocks[i].length; j++) {
                    for (let k = 0; k < fields.length; k++) {
                        if (table.modelBlocks[i][j].asfProperty.id === fields[k]) {
                            fieldsFromDyn[i][fields[k]] = table.modelBlocks[i][j]?.getAsfData()?.value?.replace(/\n/g, ', ');
                        }
                    }
                }
            }
            return fieldsFromDyn;
        },

        getDynModels: (tableId, fields) => {
            let fieldsFromDyn = [];
            let table = pdfFunc.getModel(tableId);

            for (let i = 0; i < table.modelBlocks.length; i++) {
                fieldsFromDyn.push({});
                for (let j = 0; j < table.modelBlocks[i].length; j++) {
                    for (let k = 0; k < fields.length; k++) {
                        if (table.modelBlocks[i][j].asfProperty.id === fields[k]) {
                            fieldsFromDyn[i][fields[k]] = table.modelBlocks[i][j];
                        }
                    }
                }
            }
            return fieldsFromDyn;
        },

        getRegData: async (regLinkVal, idsToFind) => {
            let regLinkUUID = await pdfFunc.restGet("rest/api/formPlayer/getAsfDataUUID?documentID=" + regLinkVal);
            if (!regLinkUUID) throw new Error('regLinkUUID not found');
            let regLinkAsfData = await pdfFunc.restGet("rest/api/asforms/data/" + regLinkUUID);
            if (!regLinkAsfData || !regLinkAsfData.data) throw new Error('regLinkAsfData not found');

            return pdfFunc.UTILS.createObjFromArr(regLinkAsfData.data, idsToFind)
        },

        joinWithCommas: (obj) => {
            const existingItems = Object.values(obj).filter(item => item !== undefined && item !== null && item !== '');
            return existingItems.join(', ');
        },

        groupIntoChunks: (array, chunkSize) => {
            const result = [];
            for (let i = 0; i < array.length; i += chunkSize) {
                const chunk = array.slice(i, i + chunkSize);
                result.push(chunk);
            }
            return result;
        },

        generateQR: (text) => {
            let qrGenerator = pdfFunc.getModel('QR_generator');
            return qrGenerator.makeQR(text).toDataURL('image/jpeg')
        },

        generateImgByGroupedData: (groupedStrings, imgGenerator, chunkSize, columnWidth) => {
            let arrayOfTables = []
            for (let i = 0; i < groupedStrings.length; i++) {
                let widths = [],
                    body = []
                for (let j = 0; j < chunkSize; j++) {
                    widths.push('*', columnWidth)
                    body.push([], groupedStrings[i][j] ? (imgGenerator(groupedStrings[i][j])) : '',)
                }
                widths.push('*');
                body.push([]);
                arrayOfTables.push(pdfFunc.Comp.Table.getTable(widths, [body], [0, 0, 0, 5],))
            }
            return arrayOfTables
        },
    },

    //START Custom Components:
    Comp: {
        PlainText: {
            // ----- old:
            getPlainText: (text, alignment = pdfFunc.ALIGNMENT.LEFT, margin = [0, 0, 0, 0], fontSize = pdfFunc.FIELD_FONTSIZE, bold = false, font = pdfFunc.FONT.TIMES) => {
                return {
                    bold: bold,
                    margin: margin,
                    fontSize: fontSize,
                    alignment: alignment,
                    text: text,
                    font: font
                }
            },
            getField: (text, alignment = pdfFunc.ALIGNMENT.LEFT, margin = [0, 0, 0, 2], fontSize = pdfFunc.FIELD_FONTSIZE, font = pdfFunc.FONT.TIMES) =>
                pdfFunc.Comp.PlainText.getPlainText(text, alignment, margin, fontSize, true, font),
            getJustify: (text, bold = false, margin = [0, 0, 0, 2], fontSize = pdfFunc.FIELD_FONTSIZE, font = pdfFunc.FONT.TIMES) =>
                pdfFunc.Comp.PlainText.getPlainText(text, 'justify', margin, fontSize, bold, font),
            getDejaField: (text, alignment = pdfFunc.ALIGNMENT.LEFT, margin = [0, 0, 0, 2], fontSize = pdfFunc.FIELD_FONTSIZE - 1, font = pdfFunc.FONT.DEJA) =>
                pdfFunc.Comp.PlainText.getPlainText(text, alignment, margin, fontSize, true, font),
            getUnderText: (text, margin = [0, 2, 0, 2]) =>
                pdfFunc.Comp.PlainText.getPlainText(text, pdfFunc.ALIGNMENT.CENTER, margin, pdfFunc.UNDER_TEXT_FONTSIZE),

            // ------ new:
            default: (text, options = {}) => {
                const {
                    margin = [0, 0, 0, 2],
                    fontSize = pdfFunc.FIELD_FONTSIZE,
                    font = pdfFunc.FONT.TIMES,
                    ...otherOptions
                } = options;

                return {
                    text: text || '',
                    margin, fontSize,
                    font, ...otherOptions
                };
            },

            center: (text, options = {}) => {
                options.alignment = options.alignment || pdfFunc.ALIGNMENT.CENTER;
                return pdfFunc.Comp.PlainText.default(text, options)
            },
            justify: (text, options = {}) => {
                options.alignment = options.alignment || pdfFunc.ALIGNMENT.JUSTIFY;
                return pdfFunc.Comp.PlainText.default(text, options)
            },
            field: (text, options = {}) => {
                options.bold = options.bold || true;
                return pdfFunc.Comp.PlainText.default(text, options)
            },
            italics: (text, options = {}) => {
                options.italics = options.italics || true;
                return pdfFunc.Comp.PlainText.default(text, options)
            },
            deja: (text, options = {}) => {
                options.bold = options.bold || true
                options.fontSize = options.fontSize || pdfFunc.FIELD_FONTSIZE - 1
                options.font = options.font || pdfFunc.FONT.DEJA
                return pdfFunc.Comp.PlainText.default(text, options)
            },
            under: (text, options = {}) => {
                options.alignment = options.alignment || pdfFunc.ALIGNMENT.CENTER;
                options.fontSize = options.fontSize || pdfFunc.UNDER_TEXT_FONTSIZE
                options.margin = options.margin || [0, 2, 0, 2]
                return pdfFunc.Comp.PlainText.default(text, options)
            },
            table: (text, options = {}) => {
                options.alignment = options.alignment || 'center';
                options.fontSize = options.fontSize || 7;
                return pdfFunc.Comp.PlainText.default(text, options)
            },
        },

        Table: {
            getTable: (widths, body, margin = [0, 0, 0, 0], layout = 'noBorders', pageBreak = 'none') => {
                return {
                    table: {
                        widths: widths,
                        body: body
                    },
                    margin: margin,
                    layout: layout,
                    pageBreak: pageBreak
                }
            },
            default: (widths, body, options = {}) => {
                const {
                    alignment = 'left',
                    margin = [0, 0, 0, 0],
                    layout = 'noBorders',
                    ...otherOptions
                } = options;

                return {
                    table: {
                        widths: widths,
                        body: body
                    },
                    layout,
                    alignment,
                    margin,
                    ...otherOptions
                }
            },
        },

        IMG: {
            getIMG: (image, width, height, options = {}) => {
                const {
                    alignment = 'left',
                    margin = [0, 0, 0, 0],
                    ...otherOptions
                } = options;

                return {
                    image: image,
                    cover: {width: width, height: height, valign: "center", align: "center"},
                    alignment, margin, ...otherOptions
                };
            },
            getUnderLine: (width, options = {}) => pdfFunc.Comp.IMG.getIMG('underline', width, 0.1, options),
        }
    },

    //START Text parsers:
    TextFrom: {

        getListBoxText: async (listBoxModel, dictCode, locale = 'ru') => {
            try {
                if (!listBoxModel) throw new Error("Can't find listbox model")
                let listBoxDict = await pdfFunc.restGet(`rest/api/dictionaries/${dictCode}?getColumns=false&locale=${locale}`);
                if (!listBoxDict || listBoxDict.hasOwnProperty('errorCode')) throw new Error("Can't find listbox dictionary code")
                return pdfFunc.UTILS.parseListBoxData(listBoxDict).find((item) => item.id === listBoxModel.value[0])?.name;
            } catch (e) {
                console.error(e);
                return ''
            }
        },

        getParsedDynText: (tableId, arrOfFieldsId) => {
            try {
                let parsedDynText = [];

                let dynData = pdfFunc.UTILS.getDynData(tableId, arrOfFieldsId);
                for (let i = 0; i < dynData.length; i++) {
                    let tempText = ''
                    for (let j = 0; j < arrOfFieldsId.length; j++) {
                        tempText += dynData[i][arrOfFieldsId[j]] && (dynData[i][arrOfFieldsId[j]] + ', ')
                    }
                    tempText = tempText.substring(0, tempText.lastIndexOf(', '))
                    parsedDynText.push(tempText)
                }
                return parsedDynText.join('.\n ');
            } catch (e) {
                console.error(e);
                return ''
            }
        },

        getFromRegFromDyn: async (tableId, regLink, fieldsIds) => {
            try {
                let table = pdfFunc.getModel(tableId);
                let parsedStrings = [];
                let regAsf
                for (let i = 0; i < table.modelBlocks.length; i++) {
                    let reglinkModel = table.modelBlocks[i].find((field) => field.asfProperty.id === regLink)
                    if (reglinkModel.value) {
                        regAsf = await pdfFunc.UTILS.getRegData(reglinkModel.value, fieldsIds);
                        let tempText = ''
                        for (let j = 0; j < fieldsIds.length; j++) {
                            if (regAsf[fieldsIds[j]]?.value) {
                                tempText += regAsf[fieldsIds[j]].value + ', '
                            }
                        }
                        tempText = tempText.substring(0, tempText.lastIndexOf(', '))
                        parsedStrings.push(tempText);
                    }
                }
                return parsedStrings.join('\n')
            } catch (e) {
                console.error(e);
                return ''
            }
        },
        getQRLink: () => `${window.location.origin}/view_contract/?dataUUID=${model.playerModel.asfDataId}`,

        getQRTextArrFromTable: () => {
            const result = [`${window.location.origin}/view_contract/?dataUUID=${model.playerModel.asfDataId}`];
            const table = pdfFunc.getModel('table_sign_info');
            if (!table) return result;
            table.modelBlocks.forEach(block => {
                const {tableBlockIndex} = block;
                const tableID = table.asfProperty.id;
                const text = [];
                text.push(`Дата подписания: ${pdfFunc.getModel('date_sign', tableID, tableBlockIndex).getTextValue() || ''}`);
                text.push(`Наименование: ${pdfFunc.getModel('textbox_name_org', tableID, tableBlockIndex).getTextValue() || ''}`);
                text.push(`ФИО на ЭЦП: ${pdfFunc.getModel('textbox_fullname', tableID, tableBlockIndex).getTextValue() || ''}`);
                let ecpDates = 'Срок ЭЦП: ';
                ecpDates += `${pdfFunc.getModel('date_expiry', tableID, tableBlockIndex).getTextValue() || ''} - `;
                ecpDates += `${pdfFunc.getModel('date_release', tableID, tableBlockIndex).getTextValue() || ''}`;
                text.push(ecpDates);
                text.push(`Действие: ${pdfFunc.getModel('listbox_action', tableID, tableBlockIndex).getTextValue() || ''}`);

                result.push(text.join('\n'));
            });

            return result;
        },

        getOrgNameAndAddress: async () => {
            const getModel = pdfFunc.getModel;
            let radio = getModel('radio_organization_or_structural_unit');
            if (!radio || !radio.value) return ' '
            let reglinkCode = radio.value[0] === '1' ? 'reglink_organization' : 'reglink_structural_unit';
            let reglink = getModel(reglinkCode);
            if (!reglink || !reglink.value) return ' '
            let reglinkStatData = await pdfFunc.UTILS.getRegData(reglink.value,
                ['textbox_full_name', 'textbox_fact_address1']
            );

            return `${reglinkStatData['textbox_full_name']?.value || ''} ${reglinkStatData['textbox_fact_address1']?.value || ''}`
        }
    },

    //START Custom blocks
    Blocks: {
        getBlockCreator: (textArr, func) => {
            let block = []
            for (let i = 0; i < textArr.length; i++) {
                block.push(func(textArr[i]))
            }
            return block
        },
        getListOfDynData: (tableId, arrOfFieldsId, parser, isReturnModel) => {
            let dynData
            if (!isReturnModel) {
                dynData = pdfFunc.UTILS.getDynData(tableId, arrOfFieldsId);
            } else {
                dynData = pdfFunc.UTILS.getDynModels(tableId, arrOfFieldsId);
            }

            let parsedDynBlocks = [];
            for (let i = 0; i < dynData.length; i++) {
                let block = parser(dynData[i], i)
                if (block) {
                    parsedDynBlocks.push(block)
                }
            }
            return parsedDynBlocks
        },

        getListOfDynDataAsync: async (tableId, arrOfFieldsId, parser, isReturnModel) => {
            let dynData
            if (!isReturnModel) {
                dynData = pdfFunc.UTILS.getDynData(tableId, arrOfFieldsId);
            } else {
                dynData = pdfFunc.UTILS.getDynModels(tableId, arrOfFieldsId);
            }

            let parsedDynBlocks = [];
            for (let i = 0; i < dynData.length; i++) {
                let block = await parser(dynData[i], i)
                if (block) {
                    parsedDynBlocks.push(block)
                }
            }
            return parsedDynBlocks
        },

        getDynTable: (tableId, arrOfFieldsId) => {
            let parsedDynText = pdfFunc.TextFrom.getParsedDynText(tableId, arrOfFieldsId);
            if (!parsedDynText) return
            return [
                pdfFunc.Comp.PlainText.deja(parsedDynText, {alignment: 'left', margin: [0, 2, 0, 2]}),
                pdfFunc.Comp.IMG.getUnderLine(518),
            ]
        },
    },
    Images: {
        'underline': "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABA+gBAREA/8QAGQABAAIDAAAAAAAAAAAAAAAAAAMEBgcJ/8QAIBABAAAEBwEAAAAAAAAAAAAAAAIENHIBAwYHQoOxw//aAAgBAQAAPwDlUAAAAAAAAAAAAAAAAAAAAzTb+nnL4PMVzUvLp+rX4AAAAAAAAAAAJJiozb4vUYAAAAAAAD//2Q==",
    }
}

const getFontsUrl = (font) => `${window.location.origin}/synergy-static/fonts/${font}`
const fontCreator = (fontNames) => {
    return {
        normal: getFontsUrl(fontNames[0] + '.ttf'),
        bold: getFontsUrl(fontNames[1] + '.ttf'),
        italics: getFontsUrl(fontNames[2] + '.ttf'),
        bolditalics: getFontsUrl(fontNames[3] + '.ttf')
    }
}
pdfMake.fonts = {}
pdfMake.fonts.Roboto = {
    normal: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf',
    bold: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Medium.ttf',
    italics: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Italic.ttf',
    bolditalics: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-MediumItalic.ttf'
}
pdfMake.fonts.Calibri = fontCreator([
    "Calibri", "Calibri-Bold", "Calibri-Italic", "Calibri-BoldItalic"
])
pdfMake.fonts.TimesNewRoman = fontCreator([
    'TimesNewRomanPS-normal', 'TimesNewRomanPS-BoldMT',
    'TimesNewRomanPS-ItalicMT', 'TimesNewRomanPS-BoldItalicMT'
]);
pdfMake.fonts.Times = fontCreator([
    'TimesNewRomanPS-normal', 'TimesNewRomanPS-BoldMT',
    'TimesNewRomanPS-ItalicMT', 'TimesNewRomanPS-BoldItalicMT'
])
pdfMake.fonts.Arial = fontCreator([
    'ArialMT', 'Arial-BoldMT',
    'Arial-ItalicMT', 'Arial-BoldItalicMT'
]);
pdfMake.fonts.DejaVuSerifCondensed = fontCreator([
    'DejaVuSerifCondensed', 'DejaVuSerifCondensed-Bold',
    'DejaVuSerifCondensed-Italic', 'DejaVuSerifCondensed-BoldItalic'
]);

model.pdfFunc = pdfFunc;
model.trigger('pdfMakeLibLoaded');
