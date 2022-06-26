//'use strict';
import {Injectable} from '@angular/core';
import {EventsService} from './events.service';
//import {sprintf} from 'sprintf-js';
import {GlobalsService} from './globals.service';
import {UtilsService} from './utils.service';

enum eRxState {
    E_STATE_RX_WAIT_START,
    E_STATE_RX_WAIT_TYPELSB,
    E_STATE_RX_WAIT_TYPEMSB,
    E_STATE_RX_WAIT_LENLSB,
    E_STATE_RX_WAIT_LENMSB,
    E_STATE_RX_WAIT_CRC,
    E_STATE_RX_WAIT_DATA,
}
const SL_START_CHAR = 0x01;
const SL_ESC_CHAR = 0x02;
const SL_END_CHAR = 0x03;

const SL_MSG_LOG = 0x8001;

const SL_MSG_TESTPORT = 0x0a09;
const SL_MSG_USB_CMD = 0x0a0d;

const USB_CMD_KEEP_AWAKE = 0x01;
const USB_CMD_FACTORY_RESET = 0x02;
const USB_CMD_SOFTWARE_RESET = 0x03;
const USB_CMD_RD_KEYS = 0x04;
const USB_CMD_WR_KEYS = 0x05;
const USB_CMD_RD_NODE_DATA_0 = 0x06;
const USB_CMD_RD_NODE_DATA_1 = 0x07;
const USB_CMD_RD_NODE_DATA_2 = 0x08;
const USB_CMD_RD_NODE_DATA_3 = 0x09;
const USB_CMD_WR_NODE_DATA_0 = 0x0a;
const USB_CMD_WR_NODE_DATA_1 = 0x0b;
const USB_CMD_WR_NODE_DATA_2 = 0x0c;
const USB_CMD_WR_NODE_DATA_3 = 0x0d;
const USB_CMD_READ_PART_NUM = 0x0e;
const USB_CMD_DONE = 0x0f;

const USB_CMD_STATUS_OK = 0x00;
const USB_CMD_STATUS_FAIL = 0x01;

export interface rdKeys_t {
    status: number;
    linkKey: string;
    epid: string;
}

const BE = false;
const HEAD_LEN = 5;
const LEN_IDX = 2;
const CRC_IDX = 4;

const DBG_MSG_LEN = 20;

@Injectable({
    providedIn: 'root',
})
export class SerialService {
    private rxState: eRxState = eRxState.E_STATE_RX_WAIT_START;
    private crc: number;
    private calcCRC: number;
    private msgIdx: number;
    private isEsc: boolean = false;
    private rxBuf = new ArrayBuffer(256);
    private rxMsg = new Uint8Array(this.rxBuf);

    private msgType: number;
    private msgLen: number;

    private SerialPort;
    slPort: any = {};
    private comPorts = [];
    public searchPortFlag = false;
    //private testPortFlag: boolean = true;
    private testPortTMO = null;
    validPortFlag: boolean = false;
    portOpenFlag: boolean = false;
    private portIdx: number = 0;
    validPortTMO = null;

    private seqNum: number = 0;
    private slCmds = [];

    now = Date.now() / 1000;

    trash: any;

    constructor(
        private events: EventsService,
        private globals: GlobalsService,
        private utils: UtilsService
    ) {
        this.SerialPort = window.nw.require('chrome-apps-serialport').SerialPort;
        setTimeout(() => {
            this.slCmdsClean();
            //this.slHostsClean();
        }, 100);
    }

    /***********************************************************************************************
     * fn          ngOnDestroy
     *
     * brief
     *
     */
    ngOnDestroy() {
        this.validPortFlag = false;
        console.log('close serial port');
        this.slPort.close((err) => {
            if (err) {
                console.log(`close err: ${err.message}`);
            }
        });
    }

    /***********************************************************************************************
     * fn          listComPorts
     *
     * brief
     *
     */
    public listComPorts() {
        this.searchPortFlag = true;
        this.validPortFlag = false;
        if (this.portOpenFlag == true) {
            this.portOpenFlag = false;
            this.slPort.close((err) => {
                if (err) {
                    console.log(`close err: ${err.message}`);
                }
            });
        }
        this.SerialPort.list().then((ports) => {
            this.comPorts = ports;
            if (ports.length) {
                this.portIdx = 0;
                setTimeout(() => {
                    this.findComPort();
                }, 100);
            } else {
                this.searchPortFlag = false;
            }
        });
    }

    /***********************************************************************************************
     * fn          findComPort
     *
     * brief
     *
     */
    public findComPort() {
        let msg: string;
        let portOpt = {
            baudrate: 115200,
            autoOpen: false,
        };
        if (this.portIdx < this.comPorts.length) {
            if (this.testPortTMO) {
                clearTimeout(this.testPortTMO);
                this.testPortTMO = null;
            }
            if (this.validPortFlag == false) {
                if (this.portOpenFlag == true) {
                    this.portOpenFlag = false;
                    this.slPort.close((err) => {
                        if (err) {
                            console.log(`close err: ${err.message}`);
                        }
                    });
                }
                let portPath = this.comPorts[this.portIdx].path;
                msg = `testing: ${portPath}`;
                this.events.publish('logMsg', msg);
                console.log(msg);
                this.slPort = new this.SerialPort(portPath, portOpt);
                this.slPort.on('open', () => {
                    this.slPort.on('data', (data) => {
                        this.slOnData(data);
                    });
                });
                this.slPort.open((err) => {
                    if (err) {
                        msg = `open err on ${this.comPorts[this.portIdx].path}: ${err.message}`;
                        this.events.publish('logMsg', msg);
                        console.log(msg);
                    } else {
                        this.portOpenFlag = true;
                        this.testPortTMO = setTimeout(() => {
                            console.log('test port tmo');
                            this.events.publish('logMsg', 'no devices');
                            this.testPortTMO = null;
                            this.portOpenFlag = false;
                            this.slPort.close((err) => {
                                if (err) {
                                    msg = `port close err: ${err.message}`;
                                    this.events.publish('logMsg', msg);
                                    console.log(msg);
                                }
                            });
                            this.searchPortFlag = false;
                        }, 1000);
                        this.testPortReq();
                    }
                });
                setTimeout(() => {
                    this.portIdx++;
                    this.findComPort();
                }, 1000);
            }
        } else {
            if (this.testPortTMO == null) {
                this.searchPortFlag = false;
            }
        }
    }

    /***********************************************************************************************
     * fn          closeComPort
     *
     * brief
     *
     */
    public closeComPort() {
        this.validPortFlag = false;
        this.events.publish('logMsg', 'close serial port');
        console.log('close serial port');
        this.slPort.close((err) => {
            if (err) {
                let msg = `port close err: ${err.message}`;
                this.events.publish('logMsg', msg);
                console.log(msg);
            }
        });
    }

    /***********************************************************************************************
     * fn          keepAwake
     *
     * brief
     *
     */
    public keepAwake() {
        if (this.validPortFlag == true) {
            this.keepAwakeReq();
            setTimeout(() => {
                this.keepAwake();
            }, 5000);
        }
    }

    /***********************************************************************************************
     * fn          slOnData
     *
     * brief
     *
     */
    public slOnData(msg) {
        let msgArrayBuf = this.utils.bufToArrayBuf(msg);
        let pkt = new Uint8Array(msgArrayBuf);
        pkt.forEach((rxByte, idx) => {
            switch (rxByte) {
                case SL_START_CHAR: {
                    this.msgIdx = 0;
                    this.isEsc = false;
                    this.rxState = eRxState.E_STATE_RX_WAIT_TYPELSB;
                    break;
                }
                case SL_ESC_CHAR: {
                    this.isEsc = true;
                    break;
                }
                case SL_END_CHAR: {
                    if (this.crc == this.calcCRC) {
                        this.processMsg();
                    }
                    this.rxState = eRxState.E_STATE_RX_WAIT_START;
                    break;
                }
                default: {
                    if (this.isEsc == true) {
                        rxByte ^= 0x10;
                        this.isEsc = false;
                    }
                    switch (this.rxState) {
                        case eRxState.E_STATE_RX_WAIT_START: {
                            // ---
                            break;
                        }
                        case eRxState.E_STATE_RX_WAIT_TYPELSB: {
                            this.msgType = rxByte;
                            this.rxState = eRxState.E_STATE_RX_WAIT_TYPEMSB;
                            this.calcCRC = rxByte;
                            break;
                        }
                        case eRxState.E_STATE_RX_WAIT_TYPEMSB: {
                            this.msgType += rxByte << 8;
                            this.rxState = eRxState.E_STATE_RX_WAIT_LENLSB;
                            this.calcCRC ^= rxByte;
                            break;
                        }
                        case eRxState.E_STATE_RX_WAIT_LENLSB: {
                            this.msgLen = rxByte;
                            this.rxState = eRxState.E_STATE_RX_WAIT_LENMSB;
                            this.calcCRC ^= rxByte;
                            break;
                        }
                        case eRxState.E_STATE_RX_WAIT_LENMSB: {
                            this.msgLen += rxByte << 8;
                            this.rxState = eRxState.E_STATE_RX_WAIT_CRC;
                            this.calcCRC ^= rxByte;
                            break;
                        }
                        case eRxState.E_STATE_RX_WAIT_CRC: {
                            this.crc = rxByte;
                            this.rxState = eRxState.E_STATE_RX_WAIT_DATA;
                            break;
                        }
                        case eRxState.E_STATE_RX_WAIT_DATA: {
                            if (this.msgIdx < this.msgLen) {
                                this.rxMsg[this.msgIdx++] = rxByte;
                                this.calcCRC ^= rxByte;
                            }
                            break;
                        }
                    }
                }
            }
        });
    }

    /***********************************************************************************************
     * fn          processMsg
     *
     * brief
     *
     */
    private processMsg() {
        switch (this.msgType) {
            case SL_MSG_TESTPORT: {
                let rxView = new DataView(this.rxBuf);
                let byteData: number;
                let msgIdx = 0;
                let seqNum = rxView.getUint8(msgIdx++);
                let cmdIdx = this.slCmds.findIndex((slCmd) => {
                    return slCmd.seqNum == seqNum;
                });
                if (cmdIdx > -1) {
                    let slCmd: any = this.slCmds.splice(cmdIdx, 1)[0];
                    if (slCmd.cmdID != SL_MSG_TESTPORT) {
                        return;
                    }
                    byteData = rxView.getUint8(msgIdx++);
                    if (byteData == 0x10) {
                        byteData = rxView.getUint8(msgIdx++);
                        if (byteData == 0x01) {
                            byteData = rxView.getUint8(msgIdx++);
                            if (byteData == 0x19) {
                                byteData = rxView.getUint8(msgIdx++);
                                if (byteData == 0x67) {
                                    clearTimeout(this.testPortTMO);
                                    this.testPortTMO = null;
                                    this.validPortFlag = true;
                                    this.searchPortFlag = false;
                                    setTimeout(() => {
                                        this.readPartNum();
                                    }, 1000);
                                    let msg = `valid device on ${this.comPorts[this.portIdx].path}`;
                                    this.events.publish('logMsg', msg);
                                    console.log(msg);
                                }
                            }
                        }
                    }
                }
                break;
            }

            case SL_MSG_USB_CMD: {
                let slMsg = new DataView(this.rxBuf);
                let idx = 0;
                let seqNum = slMsg.getUint8(idx++);
                let cmdIdx = this.slCmds.findIndex((slCmd) => {
                    return slCmd.seqNum == seqNum;
                });
                if (cmdIdx > -1) {
                    let slCmd: any = this.slCmds.splice(cmdIdx, 1)[0];
                    if (slCmd.cmdID != SL_MSG_USB_CMD) {
                        return;
                    }
                    let cmdID = slMsg.getUint8(idx++);
                    switch (cmdID) {
                        case USB_CMD_KEEP_AWAKE: {
                            let status = slMsg.getUint8(idx++);
                            if (status == USB_CMD_STATUS_OK) {
                                console.log('keep awake ok');
                            }
                            if (status == USB_CMD_STATUS_FAIL) {
                                console.log('keep awake fail');
                            }
                            break;
                        }
                        case USB_CMD_RD_KEYS: {
                            let status = slMsg.getUint8(idx++);
                            if (status == USB_CMD_STATUS_OK) {
                                let rdKeysRsp = {} as rdKeys_t;
                                rdKeysRsp.status = USB_CMD_STATUS_OK;
                                let i = 0;
                                let chrCode = 0;
                                let linkKey = '';
                                for (i = 0; i < 16; i++) {
                                    chrCode = slMsg.getUint8(idx++);
                                    if (chrCode != 0) {
                                        linkKey += String.fromCharCode(chrCode);
                                    }
                                }
                                rdKeysRsp.linkKey = linkKey;
                                let epid = '';
                                for (i = 0; i < 8; i++) {
                                    chrCode = slMsg.getUint8(idx++);
                                    if (chrCode != 0) {
                                        epid += String.fromCharCode(chrCode);
                                    }
                                }
                                rdKeysRsp.epid = epid;
                                this.events.publish('rdKeysRsp', rdKeysRsp);
                            } else {
                                this.events.publish('logMsg', 'read keys fail');
                                console.log('read keys fail');
                            }
                            break;
                        }
                        case USB_CMD_RD_NODE_DATA_0: {
                            let dataLen = slMsg.getUint8(idx++);
                            let nodeData = new Uint8Array(dataLen);
                            for (let i = 0; i < dataLen; i++) {
                                nodeData[i] = slMsg.getUint8(idx++);
                            }
                            this.events.publish('rdNodeDataRsp', nodeData);
                            break;
                        }
                        case USB_CMD_READ_PART_NUM: {
                            let partNum = slMsg.getUint32(idx++, this.globals.LE);
                            let msg = `${this.utils.timeStamp()}: comm ok`;
                            this.events.publish('logMsg', msg);
                            this.events.publish('readPartNumRsp', partNum);
                            setTimeout(() => {
                                this.readPartNum();
                            }, 5000);
                            if (this.validPortTMO) {
                                clearTimeout(this.validPortTMO);
                                this.validPortTMO = null;
                            }
                            this.validPortTMO = setTimeout(() => {
                                this.closeComPort();
                            }, 10000);
                            break;
                        }
                        default: {
                            // ---
                        }
                    }
                }
                break;
            }

            case SL_MSG_LOG: {
                let xMsg = this.rxMsg.slice(0, this.msgIdx);
                let log_msg = String.fromCharCode.apply(null, xMsg);
                this.events.publish('logMsg', log_msg);

                console.log(log_msg);
                break;
            }
        }
    }

    /***********************************************************************************************
     * fn          testPortReq
     *
     * brief
     *
     */
    private testPortReq() {
        let len: number;
        let i: number, j: number, k: number;
        let crcIdx: number;
        let lenIdx: number;

        let txArr = new Uint8Array(32);
        let slMsg = new Uint8Array(64);

        i = 0;
        txArr[i++] = SL_MSG_TESTPORT;
        txArr[i++] = SL_MSG_TESTPORT >> 8;
        lenIdx = i;
        txArr[i++] = 0;
        txArr[i++] = 0;
        crcIdx = i;
        txArr[i++] = 0; // crc
        len = i;
        txArr[i++] = this.seqNum;
        txArr[i++] = 0x10;
        txArr[i++] = 0x01;
        txArr[i++] = 0x19;
        txArr[i++] = 0x67;
        len = i - len;
        txArr[lenIdx++] = len;
        txArr[lenIdx] = len >> 8;

        let crc = 0;
        for (j = 0; j < i; j++) {
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_TESTPORT;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if (this.seqNum == 256) {
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for (j = 0; j < i; j++) {
            if (txArr[j] < 0x10) {
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, 'utf8', () => {
            // ---
        });
    }

    /***********************************************************************************************
     * fn          keepAwakeReq
     *
     * brief
     *
     */
    private keepAwakeReq() {
        let len: number;
        let i: number, j: number, k: number;
        let crcIdx: number;
        let lenIdx: number;

        let txArr = new Uint8Array(32);
        let slMsg = new Uint8Array(64);

        i = 0;
        txArr[i++] = SL_MSG_USB_CMD;
        txArr[i++] = SL_MSG_USB_CMD >> 8;
        lenIdx = i;
        txArr[i++] = 0;
        txArr[i++] = 0;
        crcIdx = i;
        txArr[i++] = 0; // crc
        len = i;
        txArr[i++] = this.seqNum;
        txArr[i++] = USB_CMD_KEEP_AWAKE;
        len = i - len;
        txArr[lenIdx++] = len;
        txArr[lenIdx] = len >> 8;

        let crc = 0;
        for (j = 0; j < i; j++) {
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_USB_CMD;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if (this.seqNum == 256) {
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for (j = 0; j < i; j++) {
            if (txArr[j] < 0x10) {
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, 'utf8', () => {
            // ---
        });
    }

    /***********************************************************************************************
     * fn          softwareRstReq
     *
     * brief
     *
     */
    public softwareRstReq() {
        let len: number;
        let i: number, j: number, k: number;
        let crcIdx: number;
        let lenIdx: number;

        let txArr = new Uint8Array(32);
        let slMsg = new Uint8Array(64);

        i = 0;
        txArr[i++] = SL_MSG_USB_CMD;
        txArr[i++] = SL_MSG_USB_CMD >> 8;
        lenIdx = i;
        txArr[i++] = 0;
        txArr[i++] = 0;
        crcIdx = i;
        txArr[i++] = 0; // crc
        len = i;
        txArr[i++] = this.seqNum;
        txArr[i++] = USB_CMD_SOFTWARE_RESET;
        len = i - len;
        txArr[lenIdx++] = len;
        txArr[lenIdx] = len >> 8;

        let crc = 0;
        for (j = 0; j < i; j++) {
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_USB_CMD;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if (this.seqNum == 256) {
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for (j = 0; j < i; j++) {
            if (txArr[j] < 0x10) {
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, 'utf8', () => {
            // ---
        });
    }

    /***********************************************************************************************
     * fn          factoryRstReq
     *
     * brief
     *
     */
    public factoryRstReq() {
        let len: number;
        let i: number, j: number, k: number;
        let crcIdx;
        Number;
        let lenIdx: number;

        let txArr = new Uint8Array(32);
        let slMsg = new Uint8Array(64);

        i = 0;
        txArr[i++] = SL_MSG_USB_CMD;
        txArr[i++] = SL_MSG_USB_CMD >> 8;
        lenIdx = i;
        txArr[i++] = 0;
        txArr[i++] = 0;
        crcIdx = i;
        txArr[i++] = 0; // crc
        len = i;
        txArr[i++] = this.seqNum;
        txArr[i++] = USB_CMD_FACTORY_RESET;
        len = i - len;
        txArr[lenIdx++] = len;
        txArr[lenIdx] = len >> 8;

        let crc = 0;
        for (j = 0; j < i; j++) {
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_USB_CMD;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if (this.seqNum == 256) {
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for (j = 0; j < i; j++) {
            if (txArr[j] < 0x10) {
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, 'utf8', () => {
            // ---
        });
    }

    /***********************************************************************************************
     * fn          rdKeys
     *
     * brief
     *
     */
    public rdKeys() {
        let len: number;
        let i: number, j: number, k: number;
        let crcIdx: number;
        let lenIdx: number;

        let txArr = new Uint8Array(32);
        let slMsg = new Uint8Array(64);

        i = 0;
        txArr[i++] = SL_MSG_USB_CMD;
        txArr[i++] = SL_MSG_USB_CMD >> 8;
        lenIdx = i;
        txArr[i++] = 0;
        txArr[i++] = 0;
        crcIdx = i;
        txArr[i++] = 0; // crc
        len = i;
        txArr[i++] = this.seqNum;
        txArr[i++] = USB_CMD_RD_KEYS;
        len = i - len;
        txArr[lenIdx++] = len;
        txArr[lenIdx] = len >> 8;

        let crc = 0;
        for (j = 0; j < i; j++) {
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_USB_CMD;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if (this.seqNum == 256) {
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for (j = 0; j < i; j++) {
            if (txArr[j] < 0x10) {
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, 'utf8', () => {
            // ---
        });
    }

    /***********************************************************************************************
     * fn          wrKeys
     *
     * brief
     *
     */
    public wrKeys(linkKey: string, epid: string) {
        let len: number;
        let i: number, j: number, k: number;
        let crcIdx: number;
        let lenIdx: number;
        let chrCode = 0;

        let txArr = new Uint8Array(32);
        let slMsg = new Uint8Array(64);

        i = 0;
        txArr[i++] = SL_MSG_USB_CMD;
        txArr[i++] = SL_MSG_USB_CMD >> 8;
        lenIdx = i;
        txArr[i++] = 0;
        txArr[i++] = 0;
        crcIdx = i;
        txArr[i++] = 0; // crc
        len = i;
        txArr[i++] = this.seqNum;
        txArr[i++] = USB_CMD_WR_KEYS;
        for (j = 0; j < 16; j++) {
            chrCode = linkKey.charCodeAt(j);
            if (chrCode) {
                txArr[i++] = chrCode;
            } else {
                txArr[i++] = 0;
            }
        }
        for (j = 0; j < 8; j++) {
            chrCode = epid.charCodeAt(j);
            if (chrCode) {
                txArr[i++] = chrCode;
            } else {
                txArr[i++] = 0;
            }
        }
        len = i - len;
        txArr[lenIdx++] = len;
        txArr[lenIdx] = len >> 8;

        let crc = 0;
        for (j = 0; j < i; j++) {
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_USB_CMD;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if (this.seqNum == 256) {
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for (j = 0; j < i; j++) {
            if (txArr[j] < 0x10) {
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, 'utf8', () => {
            // ---
        });
    }

    /***********************************************************************************************
     * fn          rdNodeData_0
     *
     * brief
     *
     */
    public rdNodeData_0() {
        let len: number;
        let i: number, j: number, k: number;
        let crcIdx: number;
        let lenIdx: number;

        let txArr = new Uint8Array(32);
        let slMsg = new Uint8Array(64);

        i = 0;
        txArr[i++] = SL_MSG_USB_CMD;
        txArr[i++] = SL_MSG_USB_CMD >> 8;
        lenIdx = i;
        txArr[i++] = 0;
        txArr[i++] = 0;
        crcIdx = i;
        txArr[i++] = 0; // crc
        len = i;
        txArr[i++] = this.seqNum;
        txArr[i++] = USB_CMD_RD_NODE_DATA_0;
        len = i - len;
        txArr[lenIdx++] = len;
        txArr[lenIdx] = len >> 8;

        let crc = 0;
        for (j = 0; j < i; j++) {
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_USB_CMD;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if (this.seqNum == 256) {
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for (j = 0; j < i; j++) {
            if (txArr[j] < 0x10) {
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, 'utf8', () => {
            // ---
        });
    }

    /***********************************************************************************************
     * fn          wrKeys
     *
     * brief
     *
     */
    public wrNodeData_0(buf: ArrayBuffer) {
        let len: number;
        let i: number, j: number, k: number;
        let crcIdx: number;
        let lenIdx: number;

        let txArr = new Uint8Array(32);
        let slMsg = new Uint8Array(64);
        let data = new Uint8Array(buf);

        i = 0;
        txArr[i++] = SL_MSG_USB_CMD;
        txArr[i++] = SL_MSG_USB_CMD >> 8;
        lenIdx = i;
        txArr[i++] = 0;
        txArr[i++] = 0;
        crcIdx = i;
        txArr[i++] = 0; // crc
        len = i;
        txArr[i++] = this.seqNum;
        txArr[i++] = USB_CMD_WR_NODE_DATA_0;
        for (j = 0; j < buf.byteLength; j++) {
            txArr[i++] = data[j];
        }
        len = i - len;
        txArr[lenIdx++] = len;
        txArr[lenIdx] = len >> 8;

        let crc = 0;
        for (j = 0; j < i; j++) {
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_USB_CMD;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if (this.seqNum == 256) {
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for (j = 0; j < i; j++) {
            if (txArr[j] < 0x10) {
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, 'utf8', () => {
            // ---
        });
    }

    /***********************************************************************************************
     * fn          readPartNum
     *
     * brief
     *
     */
    public readPartNum() {
        let len: number;
        let i: number, j: number, k: number;
        let crcIdx: number;
        let lenIdx: number;

        let txArr = new Uint8Array(32);
        let slMsg = new Uint8Array(64);

        i = 0;
        txArr[i++] = SL_MSG_USB_CMD;
        txArr[i++] = SL_MSG_USB_CMD >> 8;
        lenIdx = i;
        txArr[i++] = 0;
        txArr[i++] = 0;
        crcIdx = i;
        txArr[i++] = 0; // crc
        len = i;
        txArr[i++] = this.seqNum;
        txArr[i++] = USB_CMD_READ_PART_NUM;
        len = i - len;
        txArr[lenIdx++] = len;
        txArr[lenIdx] = len >> 8;

        let crc = 0;
        for (j = 0; j < i; j++) {
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_USB_CMD;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if (this.seqNum == 256) {
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for (j = 0; j < i; j++) {
            if (txArr[j] < 0x10) {
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, 'utf8', () => {
            // ---
        });
    }

    /***********************************************************************************************
     * fn          slCmdsClean
     *
     * brief
     *
     */
    private slCmdsClean() {
        let i = 0;
        while (this.slCmds[i]) {
            if (this.slCmds[i].ttl) {
                this.slCmds[i].ttl--;
                i++;
            } else {
                let cmd = this.slCmds.splice(i, 1)[0];
            }
        }
        setTimeout(() => {
            this.slCmdsClean();
        }, 300);
    }

    /***********************************************************************************************
     * fn          extToHex
     *
     * brief
     *
     *
    private extToHex(extAddr: number) {
        let ab = new ArrayBuffer(8);
        let dv = new DataView(ab);
        dv.setFloat64(0, extAddr);
        let extHex = [];
        for (let i = 0; i < 8; i++) {
            extHex[i] = ('0' + dv.getUint8(i).toString(16)).slice(-2);
        }
        return extHex.join(':');
    }
    */
}
