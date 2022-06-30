//'use strict';
import { Injectable, NgZone } from '@angular/core';
import { EventsService } from './events.service';
import { GlobalsService } from './globals.service';
import { UtilsService } from './utils.service';

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
const USB_CMD_WR_NODE_DATA_0 = 0x0a;
const USB_CMD_READ_PART_NUM = 0x0e;

const USB_CMD_STATUS_OK = 0x00;
const USB_CMD_STATUS_FAIL = 0x01;

export interface rdKeys_t {
    status: number;
    linkKey: string;
    epid: string;
}

export interface slMsg_t {
    type: number;
    data: number[];
}

//const BE = false;
const LE = true;
const HEAD_LEN = 5;
const LEN_IDX = 2;
const CRC_IDX = 4;

//const DBG_MSG_LEN = 20;

@Injectable({
    providedIn: 'root',
})
export class SerialService {

    public searchPortFlag = false;
    validPortFlag = false;
    portOpenFlag = false;
    private portIdx = 0;

    private testPortTMO = null;

    private crc = 0;
    private calcCRC = 0;
    private msgIdx = 0;
    private isEsc = false;
    private rxBuf = new ArrayBuffer(256);
    private rxMsg = new Uint8Array(this.rxBuf);
    private rxState = eRxState.E_STATE_RX_WAIT_START;

    private msgType = 0;
    private msgLen = 0;

    private seqNum = 0;

    slPort: any = {};
    private comPorts = [];
    private SerialPort = window.nw.require('chrome-apps-serialport').SerialPort;
    private portPath = '';

    validPortTMO = null;

    //trash: any;

    constructor(private events: EventsService,
                private globals: GlobalsService,
                private utils: UtilsService,
                private ngZone: NgZone) {
        // ---
    }

    /***********************************************************************************************
     * fn          listComPorts
     *
     * brief
     *
     */
    public listComPorts() {

        if(this.searchPortFlag){
            return;
        }
        this.searchPortFlag = true;
        this.validPortFlag = false;
        if(this.portOpenFlag == true) {
            this.closeComPort();
        }
        this.SerialPort.list().then((ports)=>{
            this.comPorts = ports;
            if(ports.length) {
                this.portIdx = 0;
                setTimeout(()=>{
                    this.findComPort();
                }, 100);
            }
            else {
                this.ngZone.run(()=>{
                    this.searchPortFlag = false;
                });
                console.log('no com ports');
            }
        });
    }

    /***********************************************************************************************
     * fn          findComPort
     *
     * brief
     *
     */
    private findComPort() {

        if(this.validPortFlag == false) {
            if(this.portOpenFlag == true) {
                this.closeComPort();
            }
            this.portPath = this.comPorts[this.portIdx].path;
            console.log('testing: ', this.portPath.replace(/[^a-zA-Z0-9]+/g, ''));
            let portOpt = {
                baudrate: 115200,
                autoOpen: false,
            };
            this.slPort = new this.SerialPort(this.portPath, portOpt);
            this.slPort.on('open', ()=>{
                this.slPort.on('data', (data)=>{
                    this.slOnData(data);
                });
            });
            let done = true;
            this.portIdx++;
            if(this.portIdx < this.comPorts.length) {
                done = false;
            }
            this.slPort.open((err)=>{
                if(err) {
                    if(done == true) {
                        this.searchPortFlag = false;
                    }
                    else {
                        setTimeout(()=>{
                            this.findComPort();
                        }, 200);
                    }
                }
                else {
                    this.portOpenFlag = true;
                    this.testPortTMO = setTimeout(()=>{
                        this.closeComPort();
                        this.portOpenFlag = false;
                        if(done == true) {
                            this.searchPortFlag = false;
                        }
                        else {
                            this.findComPort();
                        }
                        console.log('test port tmo');
                    }, 2000);
                    this.testPortReq();
                }
            });
        }
    }

    /***********************************************************************************************
     * fn          closeComPort
     *
     * brief
     *
     */
    closeComPort() {
        this.validPortFlag = false;
        if(this.portOpenFlag === false){
            return;
        }
        let msg = '';
        this.portOpenFlag = false;
        msg = 'close serial port';
        this.events.publish('logMsg', msg);
        console.log(msg);
        if(typeof this.slPort.close === 'function') {
            this.slPort.close((err)=>{
                if(err) {
                    msg = `port close err: ${err.message}`;
                    this.events.publish('logMsg', msg);
                    console.log(msg);
                }
            });
        }
    }

    /***********************************************************************************************
     * fn          slOnData
     *
     * brief
     *
     */
    private slOnData(msg) {

        let pkt = new Uint8Array(msg);

        for(let i = 0; i < pkt.length; i++) {
            let rxByte = pkt[i];
            switch(rxByte) {
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
                    if(this.crc == this.calcCRC) {
                        let slMsg: slMsg_t = {
                            type: this.msgType,
                            data: Array.from(this.rxMsg).slice(0, this.msgIdx),
                        };
                        setTimeout(()=>{
                            this.processMsg(slMsg);
                        }, 0);
                    }
                    this.rxState = eRxState.E_STATE_RX_WAIT_START;
                    break;
                }
                default: {
                    if(this.isEsc == true) {
                        rxByte ^= 0x10;
                        this.isEsc = false;
                    }
                    switch(this.rxState) {
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
                            if(this.msgIdx < this.msgLen) {
                                this.rxMsg[this.msgIdx++] = rxByte;
                                this.calcCRC ^= rxByte;
                            }
                            break;
                        }
                    }
                }
            }
        }
    }

    /***********************************************************************************************
     * fn          processMsg
     *
     * brief
     *
     */
    private processMsg(msg: slMsg_t) {

        let msgData = new Uint8Array(msg.data);
        switch(msg.type) {
            case SL_MSG_TESTPORT: {
                let slMsg = new DataView(msgData.buffer);
                let idNum = 0;
                let msgIdx = 0;
                let msgSeqNum = slMsg.getUint8(msgIdx++);
                if(msgSeqNum == this.seqNum) {
                    idNum = slMsg.getUint32(msgIdx, LE);
                    msgIdx += 4;
                    if(idNum === 0x67190110) {
                        clearTimeout(this.testPortTMO);
                        this.validPortFlag = true;
                        this.searchPortFlag = false;
                        setTimeout(()=>{
                            this.readPartNum();
                        }, 1000);
                        let msg = `valid device on ${this.portPath.replace(/[^a-zA-Z0-9]+/g, '')}`;
                        this.events.publish('logMsg', msg);
                        console.log(msg);
                    }
                }
                break;
            }
            case SL_MSG_USB_CMD: {
                let slMsg = new DataView(msgData.buffer);
                let msgIdx = 0;
                let msgSeqNum = slMsg.getUint8(msgIdx++);
                if(msgSeqNum == this.seqNum) {
                    let cmdID = slMsg.getUint8(msgIdx++);
                    switch(cmdID) {
                        case USB_CMD_KEEP_AWAKE: {
                            let status = slMsg.getUint8(msgIdx++);
                            if(status == USB_CMD_STATUS_OK) {
                                console.log('keep awake ok');
                            }
                            if(status == USB_CMD_STATUS_FAIL) {
                                console.log('keep awake fail');
                            }
                            break;
                        }
                        case USB_CMD_RD_KEYS: {
                            let status = slMsg.getUint8(msgIdx++);
                            if(status == USB_CMD_STATUS_OK) {
                                let rdKeysRsp = {} as rdKeys_t;
                                rdKeysRsp.status = USB_CMD_STATUS_OK;
                                let i = 0;
                                let chrCode = 0;
                                let linkKey = '';
                                for(i = 0; i < 16; i++) {
                                    chrCode = slMsg.getUint8(msgIdx++);
                                    if(chrCode != 0) {
                                        linkKey += String.fromCharCode(chrCode);
                                    }
                                }
                                rdKeysRsp.linkKey = linkKey;
                                let epid = '';
                                for(i = 0; i < 8; i++) {
                                    chrCode = slMsg.getUint8(msgIdx++);
                                    if(chrCode != 0) {
                                        epid += String.fromCharCode(chrCode);
                                    }
                                }
                                rdKeysRsp.epid = epid;
                                this.events.publish('rdKeysRsp', rdKeysRsp);
                            }
                            else {
                                this.events.publish('logMsg', 'read keys fail');
                                console.log('read keys fail');
                            }
                            break;
                        }
                        case USB_CMD_RD_NODE_DATA_0: {
                            let dataLen = slMsg.getUint8(msgIdx++);
                            let nodeData = new Uint8Array(dataLen);
                            for(let i = 0; i < dataLen; i++) {
                                nodeData[i] = slMsg.getUint8(msgIdx++);
                            }
                            this.events.publish('rdNodeDataRsp', nodeData);
                            break;
                        }
                        case USB_CMD_READ_PART_NUM: {
                            let partNum = slMsg.getUint32(msgIdx++, this.globals.LE);
                            this.events.publish('readPartNumRsp', partNum);
                            this.events.publish('logMsg', `${this.utils.timeStamp()}: comm ok`);
                            setTimeout(()=>{
                                this.readPartNum();
                            }, 5000);
                            if(this.validPortTMO) {
                                clearTimeout(this.validPortTMO);
                            }
                            this.validPortTMO = setTimeout(()=>{
                                this.validPortTMO = null;
                                if(this.portOpenFlag === true) {
                                    this.closeComPort();
                                }
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
                let log_msg = String.fromCharCode.apply(null, msgData);
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

        let pktBuf = new ArrayBuffer(64);
        let pktData = new Uint8Array(pktBuf);
        let pktView = new DataView(pktBuf);
        let slMsgBuf = new Uint8Array(128);
        let i: number;
        let msgIdx: number;

        this.seqNum = ++this.seqNum % 256;
        msgIdx = 0;
        pktView.setUint16(msgIdx, SL_MSG_TESTPORT, LE);
        msgIdx += 2;
        msgIdx += 2 + 1; // len + crc
        // cmd data
        pktView.setUint8(msgIdx++, this.seqNum);
        pktView.setUint32(msgIdx, 0x67190110, LE);
        msgIdx += 4;
        let msgLen = msgIdx;
        let dataLen = msgLen - HEAD_LEN;
        pktView.setUint16(LEN_IDX, dataLen, LE);
        let crc = 0;
        for(i = 0; i < msgLen; i++) {
            crc ^= pktData[i];
        }
        pktView.setUint8(CRC_IDX, crc);

        msgIdx = 0;
        slMsgBuf[msgIdx++] = SL_START_CHAR;
        for(i = 0; i < msgLen; i++) {
            if(pktData[i] < 0x10) {
                pktData[i] ^= 0x10;
                slMsgBuf[msgIdx++] = SL_ESC_CHAR;
            }
            slMsgBuf[msgIdx++] = pktData[i];
        }
        slMsgBuf[msgIdx++] = SL_END_CHAR;

        let slMsgLen = msgIdx;
        let slMsg = slMsgBuf.slice(0, slMsgLen);
        this.slPort.write(slMsg, 'utf8', ()=>{
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
        this.usbCmd(USB_CMD_SOFTWARE_RESET, null);
    }

    /***********************************************************************************************
     * fn          factoryRstReq
     *
     * brief
     *
     */
    public factoryRstReq() {
        this.usbCmd(USB_CMD_FACTORY_RESET, null);
    }

    /***********************************************************************************************
     * fn          rdKeys
     *
     * brief
     *
     */
    public rdKeys() {
        this.usbCmd(USB_CMD_RD_KEYS, null);
    }

    /***********************************************************************************************
     * fn          wrKeys
     *
     * brief
     *
     */
    public wrKeys(linkKey: string, epid: string) {
        let param = {
            linkKey: linkKey,
            epid: epid,
        };
        this.usbCmd(USB_CMD_WR_KEYS, param);
    }

    /***********************************************************************************************
     * fn          rdNodeData_0
     *
     * brief
     *
     */
    public rdNodeData_0() {
        this.usbCmd(USB_CMD_RD_NODE_DATA_0, null);
    }

    /***********************************************************************************************
     * fn          wrNodeData_0
     *
     * brief
     *
     */
    public wrNodeData_0(arrBuf: ArrayBuffer) {
        let param = {
            buf: arrBuf,
        };
        this.usbCmd(USB_CMD_WR_NODE_DATA_0, param);
    }

    /***********************************************************************************************
     * fn          readPartNum
     *
     * brief
     *
     */
    public readPartNum() {
        this.usbCmd(USB_CMD_READ_PART_NUM, null);
    }

    /***********************************************************************************************
     * fn          usbCmd
     *
     * brief
     *
     */
    public usbCmd(cmdID: number, param: any) {

        if(this.validPortFlag === false) {
            return;
        }
        let pktBuf = new ArrayBuffer(1024);
        let pktData = new Uint8Array(pktBuf);
        let pktView = new DataView(pktBuf);
        let slMsgBuf = new Uint8Array(2048);
        let i: number;
        let msgIdx: number;

        this.seqNum = ++this.seqNum % 256;
        msgIdx = 0;
        pktView.setUint16(msgIdx, SL_MSG_USB_CMD, LE);
        msgIdx += 2;
        msgIdx += 2 + 1; // len + crc
        // cmd data
        pktView.setUint8(msgIdx++, this.seqNum);
        pktView.setUint8(msgIdx++, cmdID);
        switch(cmdID) {
            case USB_CMD_WR_KEYS: {
                for(i = 0; i < 16; i++) {
                    let chrCode = param.linkKey.charCodeAt(i);
                    if(chrCode) {
                        pktView.setUint8(msgIdx++, chrCode);
                    }
                    else {
                        pktView.setUint8(msgIdx++, 0);
                    }
                }
                for(i = 0; i < 8; i++) {
                    let chrCode = param.epid.charCodeAt(i);
                    if(chrCode) {
                        pktView.setUint8(msgIdx++, chrCode);
                    }
                    else {
                        pktView.setUint8(msgIdx++, 0);
                    }
                }
                break;
            }
            case USB_CMD_WR_NODE_DATA_0: {
                let data = new Uint8Array(param.buf);
                for(i = 0; i < param.buf.byteLength; i++) {
                    pktView.setUint8(msgIdx++, data[i]);
                }
                break;
            }
            default: {
                // ---
            }
        }
        let msgLen = msgIdx;
        let dataLen = msgLen - HEAD_LEN;
        pktView.setUint16(LEN_IDX, dataLen, LE);
        let crc = 0;
        for(i = 0; i < msgLen; i++) {
            crc ^= pktData[i];
        }
        pktView.setUint8(CRC_IDX, crc);

        msgIdx = 0;
        slMsgBuf[msgIdx++] = SL_START_CHAR;
        for(i = 0; i < msgLen; i++) {
            if(pktData[i] < 0x10) {
                pktData[i] ^= 0x10;
                slMsgBuf[msgIdx++] = SL_ESC_CHAR;
            }
            slMsgBuf[msgIdx++] = pktData[i];
        }
        slMsgBuf[msgIdx++] = SL_END_CHAR;

        let slMsgLen = msgIdx;
        let slMsg = slMsgBuf.slice(0, slMsgLen);
        this.slPort.write(slMsg, 'utf8', ()=>{
            // ---
        });
    }
}
