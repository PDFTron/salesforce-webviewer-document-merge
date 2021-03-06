import { LightningElement, wire, track, api } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import { loadScript } from 'lightning/platformResourceLoader';
import libUrl from '@salesforce/resourceUrl/lib';
import myfilesUrl from '@salesforce/resourceUrl/myfiles';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import mimeTypes from './mimeTypes'
import { fireEvent, registerListener, unregisterAllListeners } from 'c/pubsub';

function _base64ToArrayBuffer(base64) {
  var binary_string = window.atob(base64);
  var len = binary_string.length;
  var bytes = new Uint8Array(len);
  for (var i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

export default class PdftronWvInstance extends LightningElement {
  source = 'My file';
  fullAPI = true;
  @api recordId;

  @wire(CurrentPageReference)
  pageRef;

  connectedCallback() {
    //'/sfc/servlet.shepherd/version/download/0694x000000pEGyAAM'
    ///servlet/servlet.FileDownload?file=documentId0694x000000pEGyAAM
    registerListener('blobSelected', this.handleBlobSelected, this);
    window.addEventListener('message', this.handleReceiveMessage.bind(this), false);
  }

  disconnectedCallback() {
    unregisterAllListeners(this);
    window.removeEventListener('message', this.handleReceiveMessage, true);
  }

  handleBlobSelected(records) {
    console.log(records);
    records = JSON.parse(records);
    let temprecords = [];

    records.forEach(record => {
      let blobby = new Blob([_base64ToArrayBuffer(record.base64)], {
        type: mimeTypes[record.FileExtension]
      });

      let payload = {
        blob: blobby,
        extension: record.FileExtension,
        filename: record.Title + "." + record.FileExtension,
        documentId: record.Id
      };

      temprecords = [...temprecords, payload];
    });
    this.iframeWindow.postMessage({ type: 'OPEN_DOCUMENT_LIST', temprecords }, '*');
  }

  renderedCallback() {
    var self = this;
    if (this.uiInitialized) {
      return;
    }
    this.uiInitialized = true;

    Promise.all([
      loadScript(self, libUrl + '/webviewer.min.js')
    ])
      .then(() => this.initUI())
      .catch(console.error);
  }

  initUI() {
    var myObj = {
      libUrl: libUrl,
      fullAPI: this.fullAPI || false,
      namespacePrefix: '',
    };
    var url = myfilesUrl + '/webviewer-demo-annotated.pdf';

    const viewerElement = this.template.querySelector('div')
    // eslint-disable-next-line no-unused-vars
    const viewer = new PDFTron.WebViewer({
      path: libUrl, // path to the PDFTron 'lib' folder on your server
      custom: JSON.stringify(myObj),
      backendType: 'ems',
      config: myfilesUrl + '/config_apex.js',
      fullAPI: this.fullAPI,
      l: 'YOUR_LICENSE_KEY_HERE',
    }, viewerElement);

    viewerElement.addEventListener('ready', () => {
      this.iframeWindow = viewerElement.querySelector('iframe').contentWindow;
    })

  }

  handleReceiveMessage(event) {
    const me = this;
    if (event.isTrusted && typeof event.data === 'object') {
      switch (event.data.type) {
        case 'SAVE_DOCUMENT':
          saveDocument({ json: JSON.stringify(event.data.payload), recordId: this.recordId }).then((response) => {
            me.iframeWindow.postMessage({ type: 'DOCUMENT_SAVED', response }, '*');

            fireEvent(this.pageRef, 'blobSelected', payload);
          }).catch(error => {
            console.error(JSON.stringify(error));
          });
          break;
        default:
          break;
      }
    }
  }

  @api
  openDocument() {
  }

  @api
  closeDocument() {
    this.iframeWindow.postMessage({ type: 'CLOSE_DOCUMENT' }, '*')
  }
}