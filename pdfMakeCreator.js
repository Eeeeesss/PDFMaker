const showMessage = (message) => {
    window.showMessage(message);
}


model.isNewWindow = true;

// model.formationData = {
//     pdfName: null,
//     fileCode: `file_${model.asfProperty.id}`
// }
let buttonFormation, buttonOpen, buttonOnWindow, fileModel, listbox_formation_pdf;

if (model?.formationData?.fileCode) {
    fileModel = model.playerModel.getModelWithId(model.formationData.fileCode);
    listbox_formation_pdf = model.playerModel.getModelWithId(model.formationData.listboxCode);
}

if (model?.formationData) {
    // ---------- Button Formation
    buttonFormation = $('<button>', {class: 'button_show_result buttonFormation'});
    buttonFormation.text('Сформировать PDF');
    if (listbox_formation_pdf && listbox_formation_pdf.value[0] !== '1') buttonFormation.hide();
    else buttonFormation.show()
    $(view.container).append(buttonFormation);

    buttonFormation.on('click', () => {
        AS.SERVICES.showWaitWindow();
        model.isNewWindow = true;
        model.trigger("clickedButton");
    })

    // ---------- Button Show Pdf
    buttonOpen = $('<button>', {class: 'button_show_result buttonOpen'});
    buttonOpen.text('Просмотр в новом окне');
    $(view.container).append(buttonOpen);


    buttonOpen.on('click', async () => {
        let fileModel = model.playerModel.getModelWithId(model.formationData.fileCode);
        if (!fileModel?.value?.identifier) {
            showMessage('Пожалуйста, сначала сформируйте документ');
            return
        }

        AS.SERVICES.showWaitWindow();
        let pdfFromStorage = await fetchPDF(fileModel.value.identifier)
        if (pdfFromStorage) {
            const url = URL.createObjectURL(pdfFromStorage);
            window.open(url, '_blank');
            URL.revokeObjectURL(url);
            AS.SERVICES.hideWaitWindow();
        }
    })
} else {
    buttonOpen = $('<button>', {class: 'button_show_result'});
    buttonOpen.text('Просмотр в новом окне');
    $(view.container).append(buttonOpen);
    buttonOpen.on('click', () => {
        AS.SERVICES.showWaitWindow();
        model.isNewWindow = true;
        model.trigger("clickedButton");
    })

    buttonOnWindow = $('<button>', {class: 'button_show_result'});
    buttonOnWindow.text('Просмотр в текущем окне');
    $(view.container).append(buttonOnWindow);
    buttonOnWindow.on('click', () => {
        AS.SERVICES.showWaitWindow();
        model.isNewWindow = false;
        model.trigger("clickedButton");
    })
}

if (model?.formationData?.fileCode && !model.EVENTlistboxChanged) {
    listbox_formation_pdf.on('valueChange', () => {
        if (listbox_formation_pdf && listbox_formation_pdf.value[0] !== '1') buttonFormation.hide();
        else buttonFormation.show()
    })
    model.EVENTlistboxChanged = true
}

if (!model.EVENTdataLoaded) {
    model.on('dataLoaded', () => {
        var dd = model.dd;

        var pdf = pdfMake.createPdf(dd, null, null);

        if (model.formationData) {
            if (fileModel) {
                let pdfMakeLib = model.playerModel.getModelWithId('pdfMakeLib');
                pdfMakeLib.promises[model.formationData.reportIndex] = new Promise(function (resolve, reject) {
                    pdf.getBlob(async (blob) => {
                        // set file and get definition
                        let createdFileDefinition = await setFile(blob);

                        // prepare merge data
                        const mergeData = {
                            uuid: model.playerModel.asfDataId,
                            data: []
                        };

                        // set file to merge
                        addAsfToMerge(fileModel, mergeData, createdFileDefinition);
                        // set listbox (if exist) to merge
                        addAsfToMerge(listbox_formation_pdf, mergeData, '2');

                        // merge data
                        resolve(
                            await AS.FORMS.ApiUtils.simpleAsyncPost("rest/api/asforms/data/merge", res => {
                                buttonFormation.hide();
                                showMessage('Документ успешно сформирован');
                                AS.SERVICES.hideWaitWindow();
                            }, null, JSON.stringify(mergeData), "application/json; charset=utf-8", err => {
                                showMessage('Печатное представление не сохранилось');
                                AS.SERVICES.hideWaitWindow();
                            })
                        )
                    });
                })
            }
        } else {
            if (model.isNewWindow) {
                pdf.open();
                AS.SERVICES.hideWaitWindow();
            } else {
                pdf.getDataUrl((dataUrl) => {
                    createFileWindow(getContentFromFile(dataUrl));
                    AS.SERVICES.hideWaitWindow();
                });
            }
        }
    })
    model.EVENTdataLoaded = true
}

function addAsfToMerge(model, mergeData, value) {
    if (model) {
        model.setValue(value)
        mergeData.data.push(model.getAsfData())
    }
}

async function setFile(blob) {
    // prepare file to upload
    let formDataToSend = new FormData;
    formDataToSend.append("file", blob, model.formationData.pdfName + '.pdf');

    // upload file
    let uploadedFileId = await AS.FORMS.ApiUtils.uploadFile(
        model.playerModel.nodeId,
        model.playerModel.asfDataId,
        formDataToSend
    );

    // get file definition
    return await AS.FORMS.ApiUtils.simpleAsyncGet(`rest/api/storage/description?elementID=${uploadedFileId}`);
}

async function fetchPDF(fileId) {
    const url = `${window.location.origin}/Synergy/rest/api/storage/file/get?identifier=${fileId}&inline=true`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {"Authorization": 'Basic ' + btoa(AS.OPTIONS.login + ":" + AS.OPTIONS.password)}
        });

        if (!response.ok) throw new Error('Network response was not ok ' + response.statusText);

        return await response.blob();
    } catch (error) {
        console.error('Fetch error: ', error);
    }
}

function getContentFromFile(src) {
    const iFrame = $(`<iframe id="file-view" src="${src}">`);
    iFrame.css({"width": "100%", "height": "100%", "transition": "0.3s"});
    return iFrame;
}

function createFileWindow(body) {
    const container = $('<div>', {class: 'custom_file_viewer'});
    const header = $('<div>');
    const fileName = $(`<span>your pdf</span>`);
    const buttonClose = $('<span>X</span>');
    const content = $('<div>');
    const asfPage = view.playerView.container.find('div.asf-container.asf-page');

    header.append(fileName, buttonClose);
    content.append(body);
    container.append(header, content);

    container.css({
        'position': 'absolute',
        'right': '0',
        'top': '0',
        'width': '50%',
        'min-height': 'calc(100vh - 50px)',
        'border': '1px solid #c4c4c4',
        'display': 'flex',
        'flex-direction': 'column',
        'height': '100%',
        'border-radius': '10px 10px 0 0',
        'overflow': 'hidden'
    });

    header.css({
        'display': 'flex',
        'justify-content': 'space-between',
        'align-items': 'center',
        'padding': '0px 15px',
        'border-bottom': '1px solid #c4c4c4',
        'background': '#4DD48B',
        'height': '35px'
    });

    content.css({
        'min-height': 'calc(100% - 35px)'
    });

    asfPage.css({
        'width': '50%'
    });

    buttonClose.css({
        'color': '#000',
        'font-size': '16px',
        'font-weight': 'bold',
        'cursor': 'pointer',
        'user-select': 'none'
    }).hover(function () {
        $(this).css("color", "red");
    }, function () {
        $(this).css("color", "#000");
    }).on('click', e => {
        container.fadeOut(200, function () {
            $(this).remove();
            asfPage.css({
                'width': '100%'
            });
        });
    });

    view.playerView.container.append(container);
}
