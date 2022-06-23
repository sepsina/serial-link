import {Component, NgZone, OnDestroy, ViewChild, OnInit} from '@angular/core';
import {GlobalsService} from './globals.service';
import {EventsService} from './events.service';
import {SerialService, rdKeys_t} from './serial.service';
import {CdkDrag, CdkDragEnd} from '@angular/cdk/drag-drop';
import {MatDialog, MatDialogConfig} from '@angular/material/dialog';
import {MatMenuTrigger} from '@angular/material/menu';
import {sprintf} from 'sprintf-js';
import {MatSelectChange} from '@angular/material/select';
import {MatSelectionListChange} from '@angular/material/list';
import {Validators, FormGroup, FormControl} from '@angular/forms';

const USB_CMD_STATUS_OK = 0x00;
const USB_CMD_STATUS_FAIL = 0x01;

const HTU21D_005 = 500;

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
    statusMsg: string = '. . . . .';
    private msgTmo: any = null;
    formGroup: FormGroup;
    linkKey: string = 'link-key-1234567';
    epid: string = 'epid-123';

    logs: string[] = [];
    scrollFlag = true;

    partNum = 0;
    validNode = true;

    startFlag = true;

    @ViewChild(MatMenuTrigger) contextMenu: MatMenuTrigger;
    contextMenuPosition = {x: '0px', y: '0px'};

    constructor(
        public serial: SerialService,
        public globals: GlobalsService,
        private events: EventsService,
        private ngZone: NgZone,
        private dialog: MatDialog
    ) {}

    ngOnInit() {
        this.formGroup = new FormGroup({
            linkKey: new FormControl(this.linkKey, [
                Validators.required,
                Validators.minLength(16),
                Validators.maxLength(16),
            ]),
            epid: new FormControl(this.epid, [Validators.maxLength(8)]),
        });
        this.events.subscribe('rdKeysRsp', (msg) => {
            this.rdKeysMsg(msg);
        });

        window.onbeforeunload = () => {
            this.ngOnDestroy();
        };

        this.events.subscribe('logMsg', (msg: string) => {
            while (this.logs.length >= 20) {
                this.logs.shift();
            }
            this.ngZone.run(() => {
                this.logs.push(msg);
            });
            if (this.scrollFlag == true) {
                let logsDiv = document.getElementById('logList');
                logsDiv.scrollTop = logsDiv.scrollHeight;
            }
        });
        this.events.subscribe('readPartNumRsp', (msg: number) => {
            this.partNum = msg;
            console.log('part number: ' + this.partNum);
            if (this.startFlag == true) {
                this.startFlag = false;
                setTimeout(() => {
                    this.readKeys();
                }, 100);
                setTimeout(() => {
                    this.events.publish('rdNodeData_0');
                }, 200);
            }
        });
    }

    /***********************************************************************************************
     * fn          readKeys
     *
     * brief
     *
     */
    readKeys() {
        this.ngZone.run(() => {
            this.formGroup.controls.linkKey.setValue('****************');
            this.formGroup.controls.epid.setValue('********');
        });
        setTimeout(() => {
            this.serial.rdKeys();
        }, 200);
    }
    /***********************************************************************************************
     * fn          rdKeysMsg
     *
     * brief
     *
     */
    rdKeysMsg(msg: rdKeys_t) {
        if (msg.status == USB_CMD_STATUS_OK) {
            console.log('msg:' + JSON.stringify(msg));
            this.formGroup.controls.linkKey.setValue(msg.linkKey);
            this.formGroup.controls.epid.setValue(msg.epid);
        }
    }

    /***********************************************************************************************
     * fn          linkKeyErr
     *
     * brief
     *
     */
    linkKeyErr() {
        if (this.formGroup.get('linkKey').hasError('required')) {
            return 'You must enter a value';
        }
        if (this.formGroup.get('linkKey').hasError('maxlength')) {
            return sprintf('link key must have %d chars', 16);
        }
        if (this.formGroup.get('linkKey').hasError('minlength')) {
            return sprintf('link key must have %d chars', 16);
        }
    }

    /***********************************************************************************************
     * fn          epidErr
     *
     * brief
     *
     */
    epidErr() {
        if (this.formGroup.get('epid').hasError('maxlength')) {
            return sprintf('epid must have less than %d chars', 8);
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
     * fn          onContextMenu
     *
     * brief
     *
     */
    onContextMenu(event, idx: number) {
        event.preventDefault();
        this.contextMenuPosition.x = event.clientX + 'px';
        this.contextMenuPosition.y = event.clientY + 'px';
        this.contextMenu.menuData = {idx: idx};
        this.contextMenu.menu.focusFirstItem('mouse');
        this.contextMenu.openMenu();
    }

    /***********************************************************************************************
     * fn          ngOnDestroy
     *
     * brief
     *
     */
    ngOnDestroy() {
        this.serial.slPort.close((err) => {
            if (err) {
                let msg = sprintf('close err: %s', err.message);
                console.log(msg);
            }
        });
        this.validNode = false;
        this.partNum = 0;
        this.startFlag = true;
    }

    /***********************************************************************************************
     * fn          setStatusMsg
     *
     * brief
     *
     */
    private setStatusMsg(msg: string) {
        this.ngZone.run(() => {
            this.statusMsg = msg;
        });
        clearTimeout(this.msgTmo);
        this.msgTmo = setTimeout(() => {
            this.ngZone.run(() => {
                this.statusMsg = '. . . . .';
            });
        }, 2000);
    }

    /***********************************************************************************************
     * fn          wrKeys
     *
     * brief
     *
     */
    wrKeys() {
        this.serial.wrKeys(this.formGroup.get('linkKey').value, this.formGroup.get('epid').value);
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