'use strict';
import { Injectable } from '@angular/core';
import { EventsService } from './events.service';
import { sprintf } from "sprintf-js";
import { GlobalsService } from './globals.service';
import { UtilsService } from './utils.service';

enum eRxState {
    E_STATE_RX_WAIT_START,
    E_STATE_RX_WAIT_TYPELSB,
    E_STATE_RX_WAIT_TYPEMSB,
    E_STATE_RX_WAIT_LENLSB,
    E_STATE_RX_WAIT_LENMSB,
    E_STATE_RX_WAIT_CRC,
    E_STATE_RX_WAIT_DATA
}
const SL_START_CHAR = 0x01;
const SL_ESC_CHAR = 0x02;
const SL_END_CHAR = 0x03;

const SL_MSG_LOG = 0x8001;

//const SL_MSG_HOST_ANNCE = 0x0A01;
//const SL_MSG_READ_ATTR_SET = 0x0A02;
//const SL_MSG_WRITE_ATTR_SET = 0x0A03;
//const SL_MSG_READ_ATTR_SET_AT_IDX = 0x0A04;
//const SL_MSG_READ_SRC_BINDS = 0x0A05;
//const SL_MSG_WRITE_SRC_BINDS = 0x0A06;
//const SL_MSG_READ_BINDS_AT_IDX = 0x0A07;
//const SL_MSG_HOST_ERROR = 0x0A08;
const SL_MSG_TESTPORT = 0x0A09;
const SL_MSG_USB_CMD = 0x0A0D;

const USB_CMD_KEEP_AWAKE = 0x01;
const USB_CMD_FACTORY_RESET = 0x02;
const USB_CMD_SOFTWARE_RESET = 0x03;
const USB_CMD_RD_KEYS = 0x04;
const USB_CMD_WR_KEYS = 0x05;
const USB_CMD_RD_NODE_DATA_0 = 0x06;
const USB_CMD_RD_NODE_DATA_1 = 0x07;
const USB_CMD_RD_NODE_DATA_2 = 0x08;
const USB_CMD_RD_NODE_DATA_3 = 0x09;
const USB_CMD_WR_NODE_DATA_0 = 0x0A;
const USB_CMD_WR_NODE_DATA_1 = 0x0B;
const USB_CMD_WR_NODE_DATA_2 = 0x0C;
const USB_CMD_WR_NODE_DATA_3 = 0x0D;
const USB_CMD_READ_PART_NUM =  0x0E;
const USB_CMD_DONE = 0x0F;


const USB_CMD_STATUS_OK = 0x00;
const USB_CMD_STATUS_FAIL = 0x01;

//const RD_ATTR_SET_OK = 0;
//const RD_ATTR_SET_FAIL = 1;

//const SL_CMD_OK = 0;
//const SL_CMD_FAIL = 1;

//const MANU_NAME_LEN = 12;
//const MODEL_ID_LEN = 12;
//const DATE_CODE_LEN = 8;
/*
interface dataHost_t {
    shortAddr: number;
    extAddr: number;
    numAttrSets: number;
    numSrcBinds: number;
    ttl: number;
}
*/
/*
export interface attrSet_t {
    hostShortAddr: number;
    partNum: number;
    clusterServer: number;
    extAddr: number;
    shortAddr: number;
    endPoint: number;
    clusterID: number;
    attrSetID: number;
    attrMap: number;
    valsLen: number;
    attrVals: number[];
}
*/
/*
interface attrSpec_t {
    attrID: number;
    attrType: string;
    isVisible: boolean;
    attrClass: string;
    formatedVal: string;
}
*/
/*
export interface hostedAttr_t {
    pos: lsPos_t;
    loc: string;
    hostShortAddr: number;
    partNum: number;
    clusterServer: number;
    extAddr: number;
    shortAddr: number;
    endPoint: number;
    clusterID: number;
    attrSetID: number;
    attrID: number;
    attrType: string;
    isVisible: boolean;
    attrClass: string;
    formatedVal: string;
}
*/
/*
export interface lsPos_t {
    x: number;
    y: number;
}
*/
/*
export interface bindDst_t {
    dstShortAddr: number;
    dstEP: number;
}
*/
/*
export interface hostedBinds_t {
    loc: string;
    partNum: number;
    hostShortAddr: number;
    extAddr: number;
    srcShortAddr: number;
    srcEP: number;
    clusterID: number;
    maxBinds: number;
    bindsDst: bindDst_t[];
}
*/

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
    providedIn: 'root'
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

    //public logs: string[] = [];

    //dataHosts: dataHost_t[] = [];
    //hostedAttribs: hostedAttr_t[] = [];
    //hostedBinds: hostedBinds_t[] = [];
    //attrSets: attrSet_t[] = [];

    trash: any;

    constructor(private events: EventsService,
                private globals: GlobalsService,
                private utils: UtilsService) {
        this.SerialPort = window.nw.require('chrome-apps-serialport').SerialPort;
        setTimeout(()=>{
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
        this.slPort.close((err)=>{
            if(err) {
                let msg = sprintf('close err: %s', err.message);
                console.log(msg);
            }
        });
    }

    /***********************************************************************************************
     * fn          listComPorts
     *
     * brief
     *
     */
    public listComPorts(){
        this.searchPortFlag = true;
        this.validPortFlag = false;
        if(this.portOpenFlag == true){
            this.portOpenFlag = false;
            this.slPort.close((err)=>{
                if(err) {
                    let msg = sprintf('close err: %s', err.message);
                    console.log(msg);
                }
            });
        }
        this.SerialPort.list().then((ports)=>{
            this.comPorts = ports;
            if(ports.length){
                this.portIdx = 0;
                setTimeout(()=>{
                    this.findComPort();
                }, 100);
            }
            else {
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
    public findComPort(){
        let msg: string;
        let portOpt = {
            baudrate: 115200,
            autoOpen: false
        };
        if(this.portIdx < this.comPorts.length) {
            if(this.testPortTMO){
                clearTimeout(this.testPortTMO);
                this.testPortTMO = null;
            }
            if(this.validPortFlag == false) {
                if(this.portOpenFlag == true){
                    this.portOpenFlag = false;
                    this.slPort.close((err)=>{
                        if(err) {
                            let msg = sprintf('close err: %s', err.message);
                            console.log(msg);
                        }
                    });
                }
                let portPath = this.comPorts[this.portIdx].path;
                this.events.publish('logMsg', 'testing: '+ portPath);
                console.log('testing: ', portPath);
                this.slPort = new this.SerialPort(portPath, portOpt);
                this.slPort.on('open', ()=>{
                    this.slPort.on('data', (data)=>{
                        this.slOnData(data);
                    });
                });
                this.slPort.open((err)=>{
                    if(err) {
                        msg = sprintf('open err on %s: %s',
                                      this.comPorts[this.portIdx].path,
                                      err.message);
                        this.events.publish('logMsg', msg);
                        console.log(msg);
                    }
                    else {
                        this.portOpenFlag = true;
                        this.testPortTMO = setTimeout(()=>{
                            console.log('test port tmo');
                            this.events.publish('logMsg', 'no devices');
                            this.testPortTMO = null;
                            this.portOpenFlag = false;
                            this.slPort.close((err)=>{
                                if(err) {
                                    this.events.publish('logMsg', sprintf('port close err: %s', err.message));
                                    console.log(sprintf('port close err: %s', err.message));
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
        }
        else {
            if(this.testPortTMO == null){
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
        this.slPort.close((err)=>{
            if(err) {
                this.events.publish('logMsg', sprintf('port close err: %s', err.message));
                console.log(sprintf('port close err: %s', err.message));
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
        if(this.validPortFlag == true) {
            this.keepAwakeReq();
            setTimeout(()=>{
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
        pkt.forEach((rxByte, idx)=>{
            switch(rxByte){
                case SL_START_CHAR: { //------------------------------------------------------------
                    this.msgIdx = 0;
                    this.isEsc = false;
                    this.rxState = eRxState.E_STATE_RX_WAIT_TYPELSB;
                    break;
                }
                case SL_ESC_CHAR: { //--------------------------------------------------------------
                    this.isEsc = true;
                    break;
                }
                case SL_END_CHAR: { //--------------------------------------------------------------
                    if(this.crc == this.calcCRC) {
                        this.processMsg();
                    }
                    this.rxState = eRxState.E_STATE_RX_WAIT_START;
                    break;
                }
                default: { //-----------------------------------------------------------------------
                    if(this.isEsc == true){
                        rxByte ^= 0x10;
                        this.isEsc = false;
                    }
                    switch(this.rxState) {
                        case eRxState.E_STATE_RX_WAIT_START: { //...................................
                            // ---
                            break;
                        }
                        case eRxState.E_STATE_RX_WAIT_TYPELSB: { //.................................
                            this.msgType = rxByte;
                            this.rxState = eRxState.E_STATE_RX_WAIT_TYPEMSB;
                            this.calcCRC = rxByte;
                            break;
                        }
                        case eRxState.E_STATE_RX_WAIT_TYPEMSB: { //.................................
                            this.msgType += rxByte << 8;
                            this.rxState = eRxState.E_STATE_RX_WAIT_LENLSB;
                            this.calcCRC ^= rxByte;
                            break;
                        }
                        case eRxState.E_STATE_RX_WAIT_LENLSB: { //..................................
                            this.msgLen = rxByte;
                            this.rxState = eRxState.E_STATE_RX_WAIT_LENMSB;
                            this.calcCRC ^= rxByte;
                            break;
                        }
                        case eRxState.E_STATE_RX_WAIT_LENMSB: { //..................................
                            this.msgLen += rxByte << 8;
                            this.rxState = eRxState.E_STATE_RX_WAIT_CRC;
                            this.calcCRC ^= rxByte;
                            break;
                        }
                        case eRxState.E_STATE_RX_WAIT_CRC: { //.....................................
                            this.crc = rxByte;
                            this.rxState = eRxState.E_STATE_RX_WAIT_DATA;
                            break;
                        }
                        case eRxState.E_STATE_RX_WAIT_DATA: { //....................................
                            if(this.msgIdx < this.msgLen){
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
    private processMsg(){
        switch(this.msgType) {
            case SL_MSG_TESTPORT: { //------------------------------------------------------------
                let rxView = new DataView(this.rxBuf);
                let byteData: number;
                let msgIdx = 0;
                let seqNum = rxView.getUint8(msgIdx++);
                let cmdIdx = this.slCmds.findIndex((slCmd)=>{
                    return (slCmd.seqNum == seqNum);
                });
                if(cmdIdx > -1) {
                    let slCmd: any = this.slCmds.splice(cmdIdx, 1)[0];
                    if(slCmd.cmdID != SL_MSG_TESTPORT){
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
                                    setTimeout(()=>{
                                        //this.keepAwake();
                                        this.readPartNum();
                                    }, 1000);
                                    this.events.publish('logMsg',
                                                        sprintf('valid device on %s', this.comPorts[this.portIdx].path));
                                    console.log(this.comPorts[this.portIdx].path, ' valid');
                                }
                            }
                        }
                    }
                }
                break;
            }

            case SL_MSG_USB_CMD: { //------------------------------------------------------------
                let slMsg = new DataView(this.rxBuf);
                let idx = 0;
                let seqNum = slMsg.getUint8(idx++);
                let cmdIdx = this.slCmds.findIndex((slCmd)=>{
                    return (slCmd.seqNum == seqNum);
                });
                if(cmdIdx > -1) {
                    let slCmd: any = this.slCmds.splice(cmdIdx, 1)[0];
                    if(slCmd.cmdID != SL_MSG_USB_CMD){
                        return;
                    }
                    let cmdID = slMsg.getUint8(idx++);
                    switch(cmdID){
                        case USB_CMD_KEEP_AWAKE: {
                            let status = slMsg.getUint8(idx++);
                            if(status == USB_CMD_STATUS_OK){
                                console.log('keep awake ok');
                            }
                            if(status == USB_CMD_STATUS_FAIL){
                                console.log('keep awake fail');
                            }
                            break;
                        }
                        case USB_CMD_RD_KEYS: {
                            let status = slMsg.getUint8(idx++);
                            if(status == USB_CMD_STATUS_OK){
                                let rdKeysRsp = {} as rdKeys_t;
                                rdKeysRsp.status = USB_CMD_STATUS_OK;
                                let i = 0;
                                let chrCode = 0;
                                let linkKey = '';
                                for(i = 0; i < 16; i++){
                                    chrCode = slMsg.getUint8(idx++);
                                    if(chrCode != 0){
                                        linkKey += String.fromCharCode(chrCode);
                                    }
                                }
                                rdKeysRsp.linkKey = linkKey;
                                let epid = '';
                                for(i = 0; i < 8; i++){
                                    chrCode = slMsg.getUint8(idx++);
                                    if(chrCode != 0){
                                        epid += String.fromCharCode(chrCode);
                                    }
                                }
                                rdKeysRsp.epid = epid;
                                this.events.publish('rdKeysRsp', rdKeysRsp);
                                //this.events.publish('logMsg', 'read keys response: ' + JSON.stringify(rdKeysRsp));
                            }
                            else {
                                this.events.publish('logMsg', 'read keys fail');
                                console.log('read keys fail');
                            }
                            break;
                        }
                        case USB_CMD_RD_NODE_DATA_0: {
                            let dataLen = slMsg.getUint8(idx++);
                            let nodeData = new Uint8Array(dataLen);
                            for(let i = 0; i < dataLen; i++){
                                nodeData[i] = slMsg.getUint8(idx++);
                            }
                            this.events.publish('rdNodeDataRsp', nodeData);
                            break;
                        }
                        case USB_CMD_READ_PART_NUM: {
                            let partNum = slMsg.getUint32(idx++, this.globals.LE);
                            this.events.publish('logMsg', sprintf('%d:comm ok', (Math.floor(Date.now() / 1000 - this.now))));
                            this.events.publish('readPartNumRsp', partNum);
                            setTimeout(()=>{
                                this.readPartNum();
                            }, 5000);
                            if(this.validPortTMO){
                                clearTimeout(this.validPortTMO);
                                this.validPortTMO = null;
                            }
                            this.validPortTMO = setTimeout(()=>{
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

            case SL_MSG_LOG: { //-------------------------------------------------------------------
                let xMsg = this.rxMsg.slice(0, this.msgIdx);
                let log_msg = String.fromCharCode.apply(null, xMsg);
                this.events.publish('logMsg', log_msg);

                console.log(log_msg);
                break;
            }

            /*
            case SL_MSG_HOST_ANNCE: { //------------------------------------------------------------
                let slMsg = new DataView(this.rxBuf);
                let dataHost = {} as dataHost_t;
                let idx = 0;
                dataHost.shortAddr = slMsg.getUint16(idx, this.globals.BE);
                idx += 2;
                dataHost.extAddr = slMsg.getFloat64(idx, this.globals.BE);
                idx += 8;
                dataHost.numAttrSets = slMsg.getInt8(idx++);
                dataHost.numSrcBinds = slMsg.getInt8(idx++);
                dataHost.ttl = slMsg.getUint16(idx, this.globals.BE);
                idx += 2;
                let hostIdx = this.dataHosts.findIndex((host)=>{
                    return (host.shortAddr == dataHost.shortAddr &&
                            host.extAddr == dataHost.extAddr);
                });
                if(hostIdx > -1){
                    this.dataHosts[hostIdx].numAttrSets = dataHost.numAttrSets;
                    this.dataHosts[hostIdx].numSrcBinds = dataHost.numSrcBinds;
                    this.dataHosts[hostIdx].ttl = dataHost.ttl;
                }
                else {
                    this.dataHosts.push(dataHost);
                }

                //this.delAllAttribsFromHost(attrHost.shortAddr);
                this.invalidateAttr(dataHost.shortAddr);
                setTimeout(()=>{
                    let startIdx = 0;
                    this.reqAttrAtIdx(dataHost.shortAddr,
                                      startIdx);
                }, 500);

                //this.delAllBindsFromHost(attrHost.shortAddr);
                setTimeout(()=>{
                    let bindsStartIdx = 0;
                    this.reqBindsAtIdx(dataHost.shortAddr,
                                       bindsStartIdx);
                }, 550);

                console.log('data host annce: ' + JSON.stringify(dataHost));

                break;
            }
            */
            /*
            case SL_MSG_READ_ATTR_SET_AT_IDX: { //------------------------------------------------------
                let rxView = new DataView(this.rxBuf);
                let msgIdx = 0;
                let slSeqNum = rxView.getUint8(msgIdx++);
                let cmdIdx = this.slCmds.findIndex((slCmd)=>{
                    return (slCmd.seqNum == slSeqNum);
                });
                if(cmdIdx > -1) {
                    let slCmd = this.slCmds.splice(cmdIdx, 1)[0];
                    if(slCmd.cmdID != SL_MSG_READ_ATTR_SET_AT_IDX){
                        return;
                    }
                    let status = rxView.getUint8(msgIdx++);
                    if(status == SL_CMD_OK) {
                        let memIdx = rxView.getInt8(msgIdx++);
                        let rxSet = {} as attrSet_t;
                        rxSet.hostShortAddr = slCmd.hostShortAddr;
                        rxSet.partNum = rxView.getUint32(msgIdx, this.globals.BE);
                        msgIdx += 4;
                        rxSet.clusterServer = rxView.getUint8(msgIdx++);
                        rxSet.extAddr = rxView.getFloat64(msgIdx, this.globals.BE);
                        msgIdx += 8;
                        rxSet.shortAddr = rxView.getUint16(msgIdx, this.globals.BE);
                        msgIdx += 2;
                        rxSet.endPoint = rxView.getUint8(msgIdx++);
                        rxSet.clusterID = rxView.getUint16(msgIdx, this.globals.BE);
                        msgIdx += 2;
                        rxSet.attrSetID = rxView.getUint16(msgIdx, this.globals.BE);
                        msgIdx += 2;
                        rxSet.attrMap = rxView.getUint16(msgIdx, this.globals.BE);
                        msgIdx += 2;
                        rxSet.valsLen = rxView.getUint8(msgIdx++);
                        rxSet.attrVals = [];
                        for(let i =  0; i < rxSet.valsLen; i++){
                            rxSet.attrVals[i] = rxView.getUint8(msgIdx++);
                        }
                        let attrSetIdx = this.attrSets.findIndex((attrSet)=>{
                            return (attrSet.shortAddr == rxSet.shortAddr &&
                                    attrSet.endPoint == rxSet.endPoint &&
                                    attrSet. clusterID == rxSet.clusterID &&
                                    attrSet.attrSetID == rxSet.attrSetID);
                        });
                        if(attrSetIdx > -1){
                            this.attrSets[attrSetIdx] = rxSet;
                        }
                        else {
                            this.attrSets.push(rxSet);
                        }

                        let hostedAttr = {} as hostedAttr_t;
                        hostedAttr.hostShortAddr = slCmd.hostShortAddr;
                        hostedAttr.partNum = rxSet.partNum;
                        hostedAttr.clusterServer = rxSet.clusterServer;
                        hostedAttr.extAddr = rxSet.extAddr;
                        hostedAttr.shortAddr = rxSet.shortAddr;
                        hostedAttr.endPoint = rxSet.endPoint;
                        hostedAttr.clusterID = rxSet.clusterID;
                        hostedAttr.attrSetID = rxSet.attrSetID;

                        let attrSpec = this.getAttrSpec(rxSet);
                        for(let i = 0; i < attrSpec.length; i++){
                            let spec = attrSpec[i];
                            hostedAttr.pos = this.lsGetPos(rxSet.shortAddr,
                                                           rxSet.endPoint,
                                                           rxSet.clusterID,
                                                           rxSet.attrSetID,
                                                           spec.attrID);
                            if(hostedAttr.pos == null){
                                hostedAttr.pos = {} as lsPos_t;
                                hostedAttr.pos.x = 0;
                                hostedAttr.pos.y = 0;
                            }
                            hostedAttr.loc = this.lsGetAttrLoc(rxSet.shortAddr,
                                                               rxSet.endPoint,
                                                               rxSet.clusterID,
                                                               rxSet.attrSetID,
                                                               spec.attrID);
                            if(hostedAttr.loc == null){
                                hostedAttr.loc = this.extToHex(rxSet.extAddr);
                            }
                            let attrIdx = this.hostedAttribs.findIndex((attr)=>{
                                return(attr.hostShortAddr == slCmd.hostShortAddr &&
                                       attr.shortAddr == rxSet.shortAddr &&
                                       attr.endPoint == rxSet.endPoint &&
                                       attr.clusterID == rxSet.clusterID &&
                                       attr.attrSetID == rxSet.attrSetID &&
                                       attr.attrID == spec.attrID);
                            });
                            if(attrIdx > -1){
                                this.hostedAttribs[attrIdx].pos = hostedAttr.pos;
                                this.hostedAttribs[attrIdx].loc = hostedAttr.loc;
                                this.hostedAttribs[attrIdx].partNum = rxSet.partNum;
                                this.hostedAttribs[attrIdx].clusterServer = rxSet.clusterServer;
                                this.hostedAttribs[attrIdx].extAddr = rxSet.extAddr;
                                this.hostedAttribs[attrIdx].isVisible = spec.isVisible;
                                this.hostedAttribs[attrIdx].attrClass = spec.attrClass;
                                this.hostedAttribs[attrIdx].formatedVal = spec.formatedVal;
                                this.hostedAttribs[attrIdx].attrType = spec.attrType;
                            }
                            else {
                                let attr = {} as hostedAttr_t;
                                attr.pos = hostedAttr.pos;
                                attr.loc = hostedAttr.loc;
                                attr.hostShortAddr = slCmd.hostShortAddr;
                                attr.partNum = rxSet.partNum;
                                attr.clusterServer = rxSet.clusterServer;
                                attr.extAddr = rxSet.extAddr;
                                attr.shortAddr = rxSet.shortAddr;
                                attr.endPoint = rxSet.endPoint;
                                attr.clusterID = rxSet.clusterID;
                                attr.attrSetID = rxSet.attrSetID;
                                attr.attrID = spec.attrID;
                                attr.isVisible = spec.isVisible;
                                attr.attrClass = spec.attrClass;
                                attr.formatedVal = spec.formatedVal;
                                attr.attrType = spec.attrType;

                                this.hostedAttribs.push(attr);
                            }
                            console.log('-----------------' + spec.formatedVal);
                        }
                        if(memIdx > -1) {
                            setTimeout(()=>{
                                let nextIdx = memIdx + 1;
                                this.reqAttrAtIdx(slCmd.hostShortAddr,
                                                  nextIdx);
                            }, 500);
                        }
                    }
                    else {
                        console.log('no attribs');
                    }
                }
                break;
            }
            */
            /*
            case SL_MSG_READ_BINDS_AT_IDX: { //------------------------------------------------------
                let rxView = new DataView(this.rxBuf);
                let msgIdx = 0;
                let slSeqNum = rxView.getUint8(msgIdx++);
                let cmdIdx = this.slCmds.findIndex((slCmd)=>{
                    return (slCmd.seqNum == slSeqNum);
                });
                if(cmdIdx > -1) {
                    let slCmd = this.slCmds.splice(cmdIdx, 1)[0];
                    if(slCmd.cmdID != SL_MSG_READ_BINDS_AT_IDX){
                        return;
                    }
                    let status = rxView.getUint8(msgIdx++);
                    if(status == SL_CMD_OK) {
                        let memIdx = rxView.getInt8(msgIdx++);
                        let rxBinds = {} as hostedBinds_t;
                        rxBinds.hostShortAddr = slCmd.hostShortAddr;
                        rxBinds.partNum = rxView.getUint32(msgIdx, this.globals.BE);
                        msgIdx += 4;
                        rxBinds.extAddr = rxView.getFloat64(msgIdx, this.globals.BE);
                        msgIdx += 8;
                        rxBinds.srcShortAddr = rxView.getUint16(msgIdx, this.globals.BE);
                        msgIdx += 2;
                        rxBinds.srcEP = rxView.getUint8(msgIdx++);
                        rxBinds.clusterID = rxView.getUint16(msgIdx, this.globals.BE);
                        msgIdx += 2;
                        rxBinds.maxBinds = rxView.getUint8(msgIdx++);
                        let numBinds = rxView.getUint8(msgIdx++);
                        rxBinds.bindsDst = [];
                        for(let i = 0; i < numBinds; i++){
                            let bindDst = {} as bindDst_t;
                            bindDst.dstShortAddr = rxView.getUint16(msgIdx, this.globals.BE);
                            msgIdx += 2;
                            bindDst.dstEP = rxView.getUint8(msgIdx++);
                            rxBinds.bindsDst.push(bindDst);
                        }

                        rxBinds.loc = this.lsGetBindLoc(rxBinds.srcShortAddr,
                                                        rxBinds.srcEP,
                                                        rxBinds.clusterID);
                        if(rxBinds.loc == null){
                            rxBinds.loc = this.extToHex(rxBinds.extAddr);
                        }

                        let bindIdx = this.hostedBinds.findIndex((bind)=>{
                            return(bind.hostShortAddr == rxBinds.hostShortAddr &&
                                   bind.srcShortAddr == rxBinds.srcShortAddr &&
                                   bind.srcEP == rxBinds.srcEP &&
                                   bind.clusterID == rxBinds.clusterID);
                        });
                        if(bindIdx > -1) {
                            this.hostedBinds[bindIdx].loc = rxBinds.loc;
                            this.hostedBinds[bindIdx].partNum = rxBinds.partNum;
                            this.hostedBinds[bindIdx].extAddr = rxBinds.extAddr;
                            this.hostedBinds[bindIdx].maxBinds = rxBinds.maxBinds;
                            this.hostedBinds[bindIdx].bindsDst = [];
                            if(numBinds > 0){
                                this.hostedBinds[bindIdx].bindsDst = JSON.parse(JSON.stringify(rxBinds.bindsDst));
                            }
                        }
                        else {
                            let newBinds = {} as hostedBinds_t;
                            newBinds.loc = rxBinds.loc;
                            newBinds.hostShortAddr = slCmd.hostShortAddr;
                            newBinds.partNum = rxBinds.partNum;
                            newBinds.extAddr = rxBinds.extAddr;
                            newBinds.srcShortAddr = rxBinds.srcShortAddr;
                            newBinds.srcEP = rxBinds.srcEP;
                            newBinds.clusterID = rxBinds.clusterID;
                            newBinds.maxBinds = rxBinds.maxBinds;
                            newBinds.bindsDst = [];
                            if(numBinds > 0){
                                newBinds.bindsDst = JSON.parse(JSON.stringify(rxBinds.bindsDst));
                            }
                            this.hostedBinds.push(newBinds);
                        }
                        console.log('rx binds: ' + JSON.stringify(rxBinds));

                        if(memIdx > -1) {
                            setTimeout(()=>{
                                let nextIdx = memIdx + 1;
                                this.reqBindsAtIdx(slCmd.hostShortAddr,
                                                   nextIdx);
                            }, 500);
                        }
                    }
                    else {
                        console.log('no binds');
                    }
                }
                break;
            }
            */
            /*
            case SL_MSG_WRITE_SRC_BINDS: { //-------------------------------------------------------
                let rxView = new DataView(this.rxBuf);
                let msgIdx = 0;
                let slSeqNum = rxView.getUint8(msgIdx++);
                let cmdIdx = this.slCmds.findIndex((slCmd)=>{
                    return (slCmd.seqNum == slSeqNum);
                });
                if(cmdIdx > -1) {
                    let slCmd = this.slCmds.splice(cmdIdx, 1)[0];
                    if(slCmd.cmdID != SL_MSG_WRITE_SRC_BINDS){
                        return;
                    }
                    let status = rxView.getUint8(msgIdx++);
                    if(status == SL_CMD_OK) {
                        console.log('wr binds status: OK');
                    }
                    else {
                        console.log('wr binds status: FAIL');
                    }
                    console.log('wr srcBinds: ' + JSON.stringify(slCmd.bindSrc));
                }
                break;
            }
            */
        }
    }

    /***********************************************************************************************
     * fn          testPortReq
     *
     * brief
     *
     */
    private testPortReq(){
        let len;
        let i, j, k;
        let crcIdx;
        let lenIdx;

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
        for(j = 0; j < i; j++){
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_TESTPORT;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if(this.seqNum == 256){
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for(j = 0; j < i; j++) {
            if(txArr[j] < 0x10){
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, "utf8", ()=>{
            // ---
        });
    }


    /***********************************************************************************************
     * fn          keepAwakeReq
     *
     * brief
     *
     */
    private keepAwakeReq(){
        let len;
        let i, j, k;
        let crcIdx;
        let lenIdx;

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
        for(j = 0; j < i; j++){
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_USB_CMD;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if(this.seqNum == 256){
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for(j = 0; j < i; j++) {
            if(txArr[j] < 0x10){
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, "utf8", ()=>{
            // ---
        });
    }

    /***********************************************************************************************
     * fn          softwareRstReq
     *
     * brief
     *
     */
    public softwareRstReq(){
        let len;
        let i, j, k;
        let crcIdx;
        let lenIdx;

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
        for(j = 0; j < i; j++){
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_USB_CMD;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if(this.seqNum == 256){
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for(j = 0; j < i; j++) {
            if(txArr[j] < 0x10){
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, "utf8", ()=>{
            // ---
        });
    }

    /***********************************************************************************************
     * fn          factoryRstReq
     *
     * brief
     *
     */
    public factoryRstReq(){
        let len;
        let i, j, k;
        let crcIdx;
        let lenIdx;

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
        for(j = 0; j < i; j++){
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_USB_CMD;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if(this.seqNum == 256){
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for(j = 0; j < i; j++) {
            if(txArr[j] < 0x10){
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, "utf8", ()=>{
            // ---
        });
    }

    /***********************************************************************************************
     * fn          rdKeys
     *
     * brief
     *
     */
    public rdKeys(){
        let len;
        let i, j, k;
        let crcIdx;
        let lenIdx;

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
        for(j = 0; j < i; j++){
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_USB_CMD;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if(this.seqNum == 256){
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for(j = 0; j < i; j++) {
            if(txArr[j] < 0x10){
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, "utf8", ()=>{
            // ---
        });
    }

    /***********************************************************************************************
     * fn          wrKeys
     *
     * brief
     *
     */
    public wrKeys(linkKey: string, epid: string){
        let len;
        let i, j, k;
        let crcIdx;
        let lenIdx;
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
        for(j = 0; j < 16; j++){
            chrCode = linkKey.charCodeAt(j);
            if(chrCode){
                txArr[i++] = chrCode;
            }
            else {
                txArr[i++] = 0;
            }
        }
        for(j = 0; j < 8; j++){
            chrCode = epid.charCodeAt(j);
            if(chrCode){
                txArr[i++] = chrCode;
            }
            else {
                txArr[i++] = 0;
            }
        }
        len = i - len;
        txArr[lenIdx++] = len;
        txArr[lenIdx] = len >> 8;

        let crc = 0;
        for(j = 0; j < i; j++){
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_USB_CMD;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if(this.seqNum == 256){
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for(j = 0; j < i; j++) {
            if(txArr[j] < 0x10){
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, "utf8", ()=>{
            // ---
        });
    }

    /***********************************************************************************************
     * fn          rdNodeData_0
     *
     * brief
     *
     */
    public rdNodeData_0(){
        let len;
        let i, j, k;
        let crcIdx;
        let lenIdx;

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
        for(j = 0; j < i; j++){
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_USB_CMD;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if(this.seqNum == 256){
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for(j = 0; j < i; j++) {
            if(txArr[j] < 0x10){
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, "utf8", ()=>{
            // ---
        });
    }

    /***********************************************************************************************
     * fn          wrKeys
     *
     * brief
     *
     */
    public wrNodeData_0(buf: ArrayBuffer){
        let len;
        let i, j, k;
        let crcIdx;
        let lenIdx;

        let txArr = new Uint8Array(32);
        let slMsg = new Uint8Array(64);
        let data  = new Uint8Array(buf);

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
        for(j = 0; j < buf.byteLength; j++){
            txArr[i++] = data[j];
        }
        len = i - len;
        txArr[lenIdx++] = len;
        txArr[lenIdx] = len >> 8;

        let crc = 0;
        for(j = 0; j < i; j++){
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_USB_CMD;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if(this.seqNum == 256){
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for(j = 0; j < i; j++) {
            if(txArr[j] < 0x10){
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, "utf8", ()=>{
            // ---
        });
    }

    /***********************************************************************************************
     * fn          readPartNum
     *
     * brief
     *
     */
    public readPartNum(){
        let len;
        let i, j, k;
        let crcIdx;
        let lenIdx;

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
        for(j = 0; j < i; j++){
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_USB_CMD;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if(this.seqNum == 256){
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for(j = 0; j < i; j++) {
            if(txArr[j] < 0x10){
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, "utf8", ()=>{
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
        while(this.slCmds[i]){
            if(this.slCmds[i].ttl){
                this.slCmds[i].ttl--;
                i++;
            }
            else {
                let cmd = this.slCmds.splice(i, 1)[0];
            }
        }
        setTimeout(()=>{
            this.slCmdsClean();
        }, 300);
    }

    /***********************************************************************************************
     * fn          lsGetAttrKey
     *
     * brief
     *
     *
    private lsGetAttrKey(shortAddr: number,
                         endPoint: number,
                         clusterID: number,
                         attrSetID: number,
                         attrID: number) {

        let ab = new ArrayBuffer(9);
        let dv = new DataView(ab);
        let idx = 0;
        dv.setUint16(idx, shortAddr);
        idx += 2;
        dv.setUint8(idx, endPoint);
        idx++;
        dv.setUint16(idx, clusterID);
        idx += 2;
        dv.setUint16(idx, attrSetID);
        idx += 2;
        dv.setUint16(idx, attrID);
        idx += 2;

        let lsKey = 'a__';
        for(let i = 0; i < idx; i++){
            lsKey += ('0' + dv.getUint8(i).toString(16)).slice(-2);
        }

        return lsKey;
    }
    */
    /***********************************************************************************************
     * fn          lsStoreAttrLoc
     *
     * brief
     *
     *
    lsStoreAttrLoc(shortAddr: number,
                   endPoint: number,
                   clusterID: number,
                   attrSetID: number,
                   attrID: number,
                   loc: string) {

        let lsKey = this.lsGetAttrKey(shortAddr,
                                      endPoint,
                                      clusterID,
                                      attrSetID,
                                      attrID);
        localStorage.setItem(lsKey, loc);
    }
    */
    /***********************************************************************************************
     * fn          lsGetAttrLoc
     *
     * brief
     *
     *
    lsGetAttrLoc(shortAddr: number,
                 endPoint: number,
                 clusterID: number,
                 attrSetID: number,
                 attrID: number) {

        let lsKey = this.lsGetAttrKey(shortAddr,
                                      endPoint,
                                      clusterID,
                                      attrSetID,
                                      attrID);
        //return JSON.parse(localStorage.getItem(lsKey));
        return localStorage.getItem(lsKey);
    }
    */
    /***********************************************************************************************
     * fn          lsRemoveAttrLoc
     *
     * brief
     *
     *
    lsRemoveAttrLoc(shortAddr: number,
                    endPoint: number,
                    clusterID: number,
                    attrSetID: number,
                    attrID: number) {

        let lsKey = this.lsGetAttrKey(shortAddr,
                                      endPoint,
                                      clusterID,
                                      attrSetID,
                                      attrID);
        localStorage.removeItem(lsKey);
    }
    */
    /***********************************************************************************************
     * fn          reqAttrAtIdx
     *
     * brief
     *
     *
    private reqAttrAtIdx(shortAddr: number,
                         startIdx: number){

        let pktBuf = new ArrayBuffer(64);
        let pktData = new Uint8Array(pktBuf);
        let pktView = new DataView(pktBuf);
        let slMsg = new Uint8Array(128);

        let i = 0;
        pktView.setUint16(i, SL_MSG_READ_ATTR_SET_AT_IDX, BE);
        i += 2;
        i += (2 + 1); // len + crc
        // cmd data
        pktView.setUint8(i++, this.seqNum);
        pktView.setUint16(i, shortAddr, BE);
        i += 2;
        pktView.setUint8(i++, startIdx);

        let msgLen = i;
        let dataLen = msgLen - HEAD_LEN;
        pktView.setUint16(LEN_IDX, dataLen, BE);
        let crc = 0;
        for(let j = 0; j < msgLen; j++){
            crc ^= pktData[j];
        }
        pktView.setUint8(CRC_IDX, crc);

        let k = 0;
        slMsg[k++] = SL_START_CHAR;
        for(let j = 0; j < msgLen; j++) {
            if(pktData[j] < 0x10){
                pktData[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = pktData[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, "utf8", ()=>{
            // ---
        });

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_READ_ATTR_SET_AT_IDX;
        slCmd.hostShortAddr = shortAddr;
        slCmd.startIdx = startIdx;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if(this.seqNum == 256){
            this.seqNum = 0;
        }
    }
    */
    /***********************************************************************************************
     * fn          reqAttrAtIdx_01
     *
     * brief
     *
     *
    private reqAttrAtIdx_01(shortAddr: number,
                            startIdx: number){
        let len;
        let i, j, k;
        let crcIdx;
        let lenIdx;

        let txArr = new Uint8Array(32);
        let slMsg = new Uint8Array(64);

        i = 0;
        txArr[i++] = SL_MSG_HOST_ATTR_AT_IDX >> 8;
        txArr[i++] = SL_MSG_HOST_ATTR_AT_IDX;
        lenIdx = i;
        txArr[i++] = 0;
        txArr[i++] = 0;
        crcIdx = i;
        txArr[i++] = 0; // crc
        len = i;
        txArr[i++] = this.seqNum;
        txArr[i++] = shortAddr >> 8;
        txArr[i++] = shortAddr;
        txArr[i++] = startIdx;
        len = i - len;
        txArr[lenIdx++] = len >> 8;
        txArr[lenIdx] = len;

        let crc = 0;
        for(j = 0; j < i; j++){
            crc ^= txArr[j];
        }
        txArr[crcIdx] = crc;

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_HOST_ATTR_AT_IDX;
        slCmd.hostShortAddr = shortAddr;
        slCmd.startIdx = startIdx;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if(this.seqNum == 256){
            this.seqNum = 0;
        }

        k = 0;
        slMsg[k++] = SL_START_CHAR;
        for(j = 0; j < i; j++) {
            if(txArr[j] < 0x10){
                txArr[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = txArr[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, "utf8", ()=>{
            // ---
        });
    }
    */
    /***********************************************************************************************
     * fn          lsGetKey
     *
     * brief
     *
     *
    private lsGetBindKey(shortAddr: number,
                         endPoint: number,
                         clusterID: number) {

        let ab = new ArrayBuffer(5);
        let dv = new DataView(ab);
        let idx = 0;

        dv.setUint16(idx, shortAddr);
        idx += 2;
        dv.setUint8(idx, endPoint);
        idx++;
        dv.setUint16(idx, clusterID);
        idx += 2;

        let lsKey = 'b__';
        for(let i = 0; i < idx; i++){
            lsKey += ('0' + dv.getUint8(i).toString(16)).slice(-2);
        }

        return lsKey;
    }
    */
    /***********************************************************************************************
     * fn          lsStoreBindLoc
     *
     * brief
     *
     *
    lsStoreBindLoc(shortAddr: number,
                   endPoint: number,
                   clusterID: number,
                   loc: string) {

        let lsKey = this.lsGetBindKey(shortAddr,
                                      endPoint,
                                      clusterID);
        localStorage.setItem(lsKey, loc);
    }
    */
    /***********************************************************************************************
     * fn          lsGetBindLoc
     *
     * brief
     *
     *
    lsGetBindLoc(shortAddr: number,
                 endPoint: number,
                 clusterID: number) {

        let lsKey = this.lsGetBindKey(shortAddr,
                                      endPoint,
                                      clusterID);
        return localStorage.getItem(lsKey);
    }
    */
    /***********************************************************************************************
     * fn          lsRemoveBindLoc
     *
     * brief
     *
     *
    lsRemoveBindLoc(shortAddr: number,
                    endPoint: number,
                    clusterID: number) {

        let lsKey = this.lsGetBindKey(shortAddr,
                                      endPoint,
                                      clusterID);
        localStorage.removeItem(lsKey);
    }
    */
    /***********************************************************************************************
     * fn          reqBindsAtIdx
     *
     * brief
     *
     *
    private reqBindsAtIdx(shortAddr: number,
                          startIdx: number){

        let pktBuf = new ArrayBuffer(64);
        let pktData = new Uint8Array(pktBuf);
        let pktView = new DataView(pktBuf);
        let slMsg = new Uint8Array(128);

        let i = 0;
        pktView.setUint16(i, SL_MSG_READ_BINDS_AT_IDX, BE);
        i += 2;
        i += (2 + 1); // len + crc
        // cmd data
        pktView.setUint8(i++, this.seqNum);
        pktView.setUint16(i, shortAddr, BE);
        i += 2;
        pktView.setUint8(i++, startIdx);

        let msgLen = i;
        let dataLen = msgLen - HEAD_LEN;
        pktView.setUint16(LEN_IDX, dataLen, BE);
        let crc = 0;
        for(let j = 0; j < msgLen; j++){
            crc ^= pktData[j];
        }
        pktView.setUint8(CRC_IDX, crc);

        let k = 0;
        slMsg[k++] = SL_START_CHAR;
        for(let j = 0; j < msgLen; j++) {
            if(pktData[j] < 0x10){
                pktData[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = pktData[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, "utf8", ()=>{
            // ---
        });

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_READ_BINDS_AT_IDX;
        slCmd.hostShortAddr = shortAddr;
        slCmd.startIdx = startIdx;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if(this.seqNum == 256){
            this.seqNum = 0;
        }
    }
    */
    /***********************************************************************************************
     * fn          wrBindsReq
     *
     * brief
     *
     *
    public wrBindsReq(bindSrc: hostedBinds_t){

        let pktBuf = new ArrayBuffer(64);
        let pktData = new Uint8Array(pktBuf);
        let pktView = new DataView(pktBuf);
        let slMsg = new Uint8Array(128);

        let i = 0;
        pktView.setUint16(i, SL_MSG_WRITE_SRC_BINDS, BE);
        i += 2;
        i += (2 + 1); // len + crc
        // cmd data
        pktView.setUint8(i++, this.seqNum);
        pktView.setUint16(i, bindSrc.hostShortAddr, BE);
        i += 2;
        pktView.setUint16(i, bindSrc.srcShortAddr, BE);
        i += 2;
        pktView.setUint8(i++, bindSrc.srcEP);
        pktView.setUint16(i, bindSrc.clusterID, BE);
        i += 2;
        let bindsLenIdx = i;
        i += 1; // bindsLen;
        let j = i;
        pktView.setUint8(i++, bindSrc.bindsDst.length);
        for(let k = 0; k < bindSrc.bindsDst.length; k++){
            pktView.setUint16(i, bindSrc.bindsDst[k].dstShortAddr, BE);
            i += 2;
            pktView.setUint8(i++, bindSrc.bindsDst[k].dstEP);
        }
        pktView.setUint8(bindsLenIdx, (i - j)); // update len field

        let msgLen = i;
        let dataLen = msgLen - HEAD_LEN;
        pktView.setUint16(LEN_IDX, dataLen, BE);
        let crc = 0;
        for(let j = 0; j < msgLen; j++){
            crc ^= pktData[j];
        }
        pktView.setUint8(CRC_IDX, crc);

        let k = 0;
        slMsg[k++] = SL_START_CHAR;
        for(let j = 0; j < msgLen; j++) {
            if(pktData[j] < 0x10){
                pktData[j] ^= 0x10;
                slMsg[k++] = SL_ESC_CHAR;
            }
            slMsg[k++] = pktData[j];
        }
        slMsg[k++] = SL_END_CHAR;
        let slWriteMsg = slMsg.slice(0, k);
        this.slPort.write(slWriteMsg, "utf8", ()=>{
            // ---
        });

        let slCmd: any = {};
        slCmd.seqNum = this.seqNum;
        slCmd.ttl = 5;
        slCmd.cmdID = SL_MSG_WRITE_SRC_BINDS;
        slCmd.hostShortAddr = bindSrc.hostShortAddr;
        slCmd.bindSrc = bindSrc;

        this.slCmds.push(slCmd);

        this.seqNum++;
        if(this.seqNum == 256){
            this.seqNum = 0;
        }
    }
    */



    /***********************************************************************************************
     * fn          slHostsClean
     *
     * brief
     *
     *
    private slHostsClean() {
        let i = 0;
        while(this.dataHosts[i]){
            if(this.dataHosts[i].ttl){
                this.dataHosts[i].ttl--;
                i++;
            }
            else {
                let host = this.dataHosts.splice(i, 1)[0];
                // TODO
            }
        }
        setTimeout(()=>{
            this.slHostsClean();
        }, 1000);
    }
    */
    /***********************************************************************************************
     * fn          delAllAttribsFromHost
     *
     * brief
     *
     *
    private delAllAttribsFromHost(hostShortAddr: number) {
        let i = 0;
        while(this.hostedAttribs[i]){
            if(this.hostedAttribs[i].hostShortAddr == hostShortAddr){
                this.hostedAttribs.splice(i, 1);
            }
            else {
                i++;
            }
        }
    }
    */
    /***********************************************************************************************
     * fn          delAllBindsFromHost
     *
     * brief
     *
     *
    private delAllBindsFromHost(hostShortAddr: number) {
        let i = 0;
        while(this.hostedBinds[i]){
            if(this.hostedBinds[i].hostShortAddr == hostShortAddr){
                this.hostedBinds.splice(i, 1);
            }
            else {
                i++;
            }
        }
    }
    */
    /***********************************************************************************************
     * fn          invalidateAttr
     *
     * brief
     *
     *
    invalidateAttr(hostShortAddr: number) {
        this.hostedAttribs.forEach((attr, index)=>{
            if(attr.hostShortAddr == hostShortAddr){
                let strVal = this.hostedAttribs[index].formatedVal;
                if(strVal){
                    let invalidVal = strVal.replace(/[0-9]/g, "-");
                    this.hostedAttribs[index].formatedVal = invalidVal;
                }
            }
        });
    }
    */
    /***********************************************************************************************
     * fn          extToHex
     *
     * brief
     *
     */
    private extToHex(extAddr: number) {

        let ab = new ArrayBuffer(8);
        let dv = new DataView(ab);
        dv.setFloat64(0, extAddr);
        let extHex = [];
        for(let i = 0; i < 8; i++){
            extHex[i] = ('0' + dv.getUint8(i).toString(16)).slice(-2);
        }
        return extHex.join(':');
    }

    /***********************************************************************************************
     * fn          lsPosKey
     *
     * brief
     *
     *
    private lsPosKey(shortAddr: number,
                     endPoint: number,
                     clusterID: number,
                     attrSetID: number,
                     attrID: number) {

        let ab = new ArrayBuffer(9);
        let dv = new DataView(ab);
        let idx = 0;
        dv.setUint16(idx, shortAddr);
        idx += 2;
        dv.setUint8(idx, endPoint);
        idx++;
        dv.setUint16(idx, clusterID);
        idx += 2;
        dv.setUint16(idx, attrSetID);
        idx += 2;
        dv.setUint16(idx, attrID);
        idx += 2;

        let lsPosKey = 'p__';
        for(let i = 0; i < idx; i++){
            lsPosKey += ('0' + dv.getUint8(i).toString(16)).slice(-2);
        }

        return lsPosKey;
    }
    */
    /***********************************************************************************************
     * fn          lsStorePos
     *
     * brief
     *
     *
    lsStorePos(shortAddr: number,
               endPoint: number,
               clusterID: number,
               attrSetID: number,
               attrID: number,
               pos: lsPos_t) {
        let lsPosKey = this.lsPosKey(shortAddr,
                                     endPoint,
                                     clusterID,
                                     attrSetID,
                                     attrID);
        localStorage.setItem(lsPosKey, JSON.stringify(pos));
    }
    */
    /***********************************************************************************************
     * fn          lsGetPos
     *
     * brief
     *
     *
    private lsGetPos(shortAddr: number,
                     endPoint: number,
                     clusterID: number,
                     attrSetID: number,
                     attrID: number) {

        let lsPosKey = this.lsPosKey(shortAddr,
                                     endPoint,
                                     clusterID,
                                     attrSetID,
                                     attrID);
        return JSON.parse(localStorage.getItem(lsPosKey));
    }
    */
    /***********************************************************************************************
     * fn          lsRemovePos
     *
     * brief
     *
     *
    private lsRemovePos(shortAddr: number,
                        endPoint: number,
                        clusterID: number,
                        attrSetID: number,
                        attrID: number) {

        let lsPosKey = this.lsPosKey(shortAddr,
                                     endPoint,
                                     clusterID,
                                     attrSetID,
                                     attrID);
        localStorage.removeItem(lsPosKey);
    }
    */
    /***********************************************************************************************
     * fn          parseAttr
     *
     * brief
     *
     *
    private getAttrSpec(attrSet: attrSet_t): attrSpec_t[] {

        let attrSpecs: attrSpec_t[] = [];
        let valsBuff = new ArrayBuffer(64);
        let valsData = new Uint8Array(valsBuff);
        for(let i =  0; i < attrSet.valsLen; i++){
            valsData[i] = attrSet.attrVals[i];
        }
        let valsView = new DataView(valsBuff);
        let idx: number;
        let i: number;

        if(attrSet.clusterID == this.globals.CLUSTER_ID_MS_TEMPERATURE_MEASUREMENT){
            if(attrSet.attrSetID == 0x0000){
                idx = 0;
                for(let i = 0; i < 16; i++){
                    let spec = {} as attrSpec_t;
                    spec.attrID = i;
                    spec.attrType = "other";
                    spec.isVisible = false;
                    spec.attrClass = "";
                    spec.formatedVal = "";
                    switch(i){
                        case 0: {
                            let temp = valsView.getInt16(idx, BE);
                            idx += 2;
                            if(attrSet.attrMap & (1 << i)){
                                temp /= 10.0;
                                spec.formatedVal = sprintf('%.1f degC', temp);
                                spec.attrType = 'temp';
                                spec.attrClass = 't-attr';
                                spec.isVisible = true;
                                attrSpecs.push(spec);
                            }
                            break;
                        }
                        case 1: {
                            let minVal = valsView.getInt16(idx, BE);
                            idx += 2;
                            if(attrSet.attrMap & (1 << i)){
                                spec.formatedVal = sprintf('min value: %d', minVal);
                                attrSpecs.push(spec);
                            }
                            break;
                        }
                        case 2: {
                            let maxVal = valsView.getInt16(idx, BE);
                            idx += 2;
                            if(attrSet.attrMap & (1 << i)){
                                spec.formatedVal = sprintf('max value: %d', maxVal);
                                attrSpecs.push(spec);
                            }
                            break;
                        }
                        case 3: {
                            let tolerance = valsView.getUint16(idx, BE);
                            idx += 2;
                            if(attrSet.attrMap & (1 << i)){
                                spec.formatedVal = sprintf('tolerance: %d', tolerance);
                                attrSpecs.push(spec);
                            }
                            break;
                        }
                        default: {
                            // ---
                        }
                    }
                }
            }
        }
        if(attrSet.clusterID == this.globals.CLUSTER_ID_MS_RH_MEASUREMENT){
            if(attrSet.attrSetID == 0x0000){
                idx = 0;
                for(let i = 0; i < 16; i++){
                    let spec = {} as attrSpec_t;
                    spec.attrID = i;
                    spec.attrType = "other";
                    spec.isVisible = false;
                    spec.attrClass = "";
                    spec.formatedVal = "";
                    switch(i){
                        case 0: {
                            let rh = valsView.getUint16(idx, BE);
                            idx += 2;
                            if(attrSet.attrMap & (1 << i)){
                                rh /= 10.0;
                                spec.formatedVal = sprintf('%.1f %%RH', rh);
                                spec.attrType = 'rh';
                                spec.attrClass = 'rh-attr';
                                spec.isVisible = true;
                                attrSpecs.push(spec);
                            }
                            break;
                        }
                        case 1: {
                            let minVal = valsView.getUint16(idx, BE);
                            idx += 2;
                            if(attrSet.attrMap & (1 << i)){
                                spec.formatedVal = sprintf('min value: %d', minVal);
                                attrSpecs.push(spec);
                            }
                            break;
                        }
                        case 2: {
                            let maxVal = valsView.getUint16(idx, BE);
                            idx += 2;
                            if(attrSet.attrMap & (1 << i)){
                                spec.formatedVal = sprintf('max value: %d', maxVal);
                                attrSpecs.push(spec);
                            }
                            break;
                        }
                        case 3: {
                            let tolerance = valsView.getUint16(idx, BE);
                            idx += 2;
                            if(attrSet.attrMap & (1 << i)){
                                spec.formatedVal = sprintf('tolerance: %d', tolerance);
                                attrSpecs.push(spec);
                            }
                            break;
                        }
                        default: {
                            // ---
                        }
                    }
                }
            }
        }
        if(attrSet.clusterID == this.globals.CLUSTER_ID_GEN_BASIC){
            if(attrSet.attrSetID == 0x0000){
                idx = 0;
                for(let i = 0; i < 16; i++){
                    let spec = {} as attrSpec_t;
                    spec.attrID = i;
                    spec.attrType = "other";
                    spec.isVisible = false;
                    spec.attrClass = "";
                    spec.formatedVal = "";
                    switch(i){
                        case 0: {
                            let zclVersion = valsView.getUint8(idx++);
                            if(attrSet.attrMap & (1 << i)){
                                spec.formatedVal = sprintf('zcl version: %d', zclVersion);
                                attrSpecs.push(spec);
                            }
                            break;
                        }
                        case 1: {
                            let appVersion = valsView.getUint8(idx++);
                            if(attrSet.attrMap & (1 << i)){
                                spec.formatedVal = sprintf('app version: %d', appVersion);
                                attrSpecs.push(spec);
                            }
                            break;
                        }
                        case 2: {
                            let stackVersion = valsView.getUint8(idx++);
                            if(attrSet.attrMap & (1 << i)){
                                spec.formatedVal = sprintf('stack version: %d', stackVersion);
                                attrSpecs.push(spec);
                            }
                            break;
                        }
                        case 3: {
                            let hwVersion = valsView.getUint8(idx++);
                            if(attrSet.attrMap & (1 << i)){
                                spec.formatedVal = sprintf('hw version: %d', hwVersion);
                                attrSpecs.push(spec);
                            }
                            break;
                        }
                        case 4: {
                            let manuName = "";
                            for(let j = 0; j < MANU_NAME_LEN; j++){
                                let char = valsView.getUint8(idx++);
                                if(char){
                                    manuName += String.fromCharCode(char);
                                }
                            }
                            if(attrSet.attrMap & (1 << i)){
                                spec.formatedVal = sprintf('manufacturer name: %s', manuName);
                                attrSpecs.push(spec);
                            }
                            break;
                        }
                        case 5: {
                            let modelID = "";
                            for(let j = 0; j < MODEL_ID_LEN; j++){
                                let char = valsView.getUint8(idx++);
                                if(char){
                                    modelID += String.fromCharCode(char);
                                }
                            }
                            if(attrSet.attrMap & (1 << i)){
                                spec.formatedVal = sprintf('model id: %s', modelID);
                                attrSpecs.push(spec);
                            }
                            break;
                        }
                        case 6: {
                            let dateCode = "";
                            for(let j = 0; j < DATE_CODE_LEN; j++){
                                let char = valsView.getUint8(idx++);
                                if(char){
                                    dateCode += String.fromCharCode(char);
                                }
                            }
                            if(attrSet.attrMap & (1 << i)){
                                spec.formatedVal = sprintf('date code: %s', dateCode);
                                attrSpecs.push(spec);
                            }
                            break;
                        }
                        case 7: {
                            let pwrSrc = valsView.getUint8(idx++);
                            if(attrSet.attrMap & (1 << i)){
                                spec.formatedVal = sprintf('power source: %d', pwrSrc);
                                attrSpecs.push(spec);
                            }
                            break;
                        }
                        default: {
                            // ---
                        }
                    }
                }
            }
        }
        if(attrSet.clusterID == this.globals.CLUSTER_ID_GEN_ON_OFF){
            if(attrSet.attrSetID == 0x0000){
                idx = 0;
                for(let i = 0; i < 16; i++){
                    let spec = {} as attrSpec_t;
                    spec.attrID = i;
                    spec.attrType = "other";
                    spec.isVisible = false;
                    spec.attrClass = "";
                    spec.formatedVal = "";
                    switch(i){
                        case 0: {
                            let sw = valsView.getUint8(idx++);
                            if(attrSet.attrMap & (1 << i)){
                                spec.attrType = 'switch';
                                spec.isVisible = true;
                                spec.attrClass = 'sw-attr';
                                if(sw == 0){
                                    spec.formatedVal = 'light: off'
                                }
                                else {
                                    spec.formatedVal = 'light: on'
                                }
                                attrSpecs.push(spec);
                            }
                            break;
                        }

                        default: {
                            // ---
                        }
                    }
                }
            }
        }
        if(attrSet.clusterID == this.globals.CLUSTER_ID_POWER_CFG){
            if(attrSet.attrSetID == 0x0020) {
                idx = 0;
                for(let i = 0; i < 16; i++){
                    let spec = {} as attrSpec_t;
                    spec.attrID = i;
                    spec.attrType = "other";
                    spec.isVisible = false;
                    spec.attrClass = "";
                    spec.formatedVal = "";
                    switch(i){
                        case 0: {
                            let batVolt = valsView.getUint8(idx++);
                            if(attrSet.attrMap & (1 << i)){
                                batVolt /= 10.0;
                                spec.formatedVal = sprintf('%.1f V', batVolt);
                                spec.attrType = 'battVolt';
                                spec.attrClass = 'batt-attr';
                                spec.isVisible = true;
                                attrSpecs.push(spec);
                            }
                            break;
                        }
                        case 1: {
                            let percRemain = valsView.getUint8(idx++);
                            if(attrSet.attrMap & (1 << i)){
                                spec.formatedVal = sprintf('batt remaining: %d', percRemain);
                                attrSpecs.push(spec);
                            }
                            break;
                        }
                        default: {
                            // ---
                        }
                    }
                }
            }
        }

        return attrSpecs;
    }
    */
}
