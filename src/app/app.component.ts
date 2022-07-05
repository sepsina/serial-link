import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { GlobalsService } from './globals.service';
import { EventsService } from './events.service';
import { SerialService, rdKeys_t } from './serial.service';
import { Validators, FormGroup, FormControl } from '@angular/forms';

const USB_CMD_STATUS_OK = 0x00;
//const USB_CMD_STATUS_FAIL = 0x01;

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {

    secGroup: FormGroup;
    linkKey: string = 'link-key-1234567';
    epid: string = 'epid-123';

    logs: string[] = [];
    scrollFlag = true;

    partNum = 0;
    startFlag = true;

    constructor(public serial: SerialService,
                public globals: GlobalsService,
                private events: EventsService,
                private ngZone: NgZone) {
        // ---
    }

    /***********************************************************************************************
     * fn          ngOnDestroy
     *
     * brief
     *
     */
    ngOnDestroy() {
        this.serial.closeComPort();
        this.secGroup.reset();
    }

    /***********************************************************************************************
     * fn          ngOnInit
     *
     * brief
     *
     */
    ngOnInit() {

        this.secGroup = new FormGroup({
            linkKey: new FormControl(this.linkKey, [
                Validators.required,
                Validators.minLength(16),
                Validators.maxLength(16),
            ]),
            epid: new FormControl(this.epid, [Validators.maxLength(8)]),
        });

        this.events.subscribe('rdKeysRsp', (msg)=>{
            this.rdKeysMsg(msg);
        });

        window.onbeforeunload = ()=>{
            this.ngOnDestroy();
        };

        this.events.subscribe('logMsg', (msg: string)=>{
            while(this.logs.length >= 20) {
                this.logs.shift();
            }
            this.ngZone.run(()=>{
                this.logs.push(msg);
            });
            if(this.scrollFlag == true) {
                let logsDiv = document.getElementById('logList');
                logsDiv.scrollTop = logsDiv.scrollHeight;
            }
        });
        this.events.subscribe('readPartNumRsp', (msg: number)=>{
            this.partNum = msg;
            console.log(`part number: ${this.partNum}`);
            if(this.startFlag == true) {
                this.startFlag = false;
                setTimeout(()=>{
                    this.readKeys();
                }, 100);
                setTimeout(()=>{
                    this.events.publish('rdNodeData_0');
                }, 200);
            }
        });
    }

    /***********************************************************************************************
     * fn          autoScroll
     *
     * brief
     *
     */
    autoScrollChange(scroll) {
        console.log(scroll);
        this.scrollFlag = scroll;
        if(scroll == true) {
            let logsDiv = document.getElementById('logList');
            logsDiv.scrollTop = logsDiv.scrollHeight;
        }
    }
    /***********************************************************************************************
     * fn          readKeys
     *
     * brief
     *
     */
    readKeys() {
        this.ngZone.run(()=>{
            this.secGroup.get('linkKey').setValue('****************');
            this.secGroup.get('epid').setValue('********');
        });
        setTimeout(()=>{
            this.serial.rdKeys();
        }, 500);
    }
    /***********************************************************************************************
     * fn          rdKeysMsg
     *
     * brief
     *
     */
    rdKeysMsg(msg: rdKeys_t) {
        if(msg.status == USB_CMD_STATUS_OK) {
            console.log(`msg: ${JSON.stringify(msg)}`);
            this.ngZone.run(()=>{
                this.secGroup.get('linkKey').setValue(msg.linkKey);
                this.secGroup.get('epid').setValue(msg.epid);
            });
        }
    }

    /***********************************************************************************************
     * fn          linkKeyErr
     *
     * brief
     *
     */
    linkKeyErr() {
        if(this.secGroup.get('linkKey').hasError('required')) {
            return 'You must enter a value';
        }
        if(this.secGroup.get('linkKey').hasError('maxlength')) {
            return 'link key must have 16 chars';
        }
        if(this.secGroup.get('linkKey').hasError('minlength')) {
            return 'link key must have 16 chars';
        }
    }

    /***********************************************************************************************
     * fn          epidErr
     *
     * brief
     *
     */
    epidErr() {
        if(this.secGroup.get('epid').hasError('maxlength')) {
            return 'epid must have less than 8 chars';
        }
    }

    /***********************************************************************************************
     * fn          openSerial
     *
     * brief
     *
     */
    openSerial() {
        this.serial.listComPorts();
    }

    /***********************************************************************************************
     * fn          closeSerial
     *
     * brief
     *
     */
    closeSerial() {
        this.serial.closeComPort();
        this.startFlag = true;
    }

    /***********************************************************************************************
     * fn          wrKeys
     *
     * brief
     *
     */
    wrKeys() {
        this.serial.wrKeys(this.secGroup.get('linkKey').value,
                           this.secGroup.get('epid').value);
    }

    /***********************************************************************************************
     * fn          clearLogs
     *
     * brief
     *
     */
    clearLogs() {
        this.logs = [];
    }
}
