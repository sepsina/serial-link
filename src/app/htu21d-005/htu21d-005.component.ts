import { Component, OnInit, NgZone } from '@angular/core';
import { SerialService } from '../serial.service';
import { EventsService } from '../events.service';
import { GlobalsService } from '../globals.service';
import { Validators, FormGroup, FormControl } from '@angular/forms';

@Component({
    selector: 'app-htu21d-005',
    templateUrl: './htu21d-005.component.html',
    styleUrls: ['./htu21d-005.component.scss'],
})
export class HTU21D_005_Component implements OnInit {

    minInt = 5;
    maxInt = 30;

    rhFlag = false;
    tempFlag = false;
    batVoltFlag = false;

    repIntFormCtrl: FormControl;

    constructor(private serial: SerialService,
                private events: EventsService,
                private globals: GlobalsService,
                private ngZone: NgZone) {
        //---
    }

    ngOnInit(): void {

        this.events.subscribe('rdNodeDataRsp', (msg: Uint8Array)=>{
            let buf = msg.buffer;
            let data = new DataView(buf);
            let idx = 0;

            let partNum = data.getUint32(idx, this.globals.LE);
            idx += 4;
            if(partNum == this.globals.HTU21D_005) {
                this.ngZone.run(()=>{
                    this.rhFlag = !!data.getUint8(idx++);
                    this.tempFlag = !!data.getUint8(idx++);
                    this.batVoltFlag = !!data.getUint8(idx++);
                    this.repIntFormCtrl.setValue(data.getUint8(idx++));
                });
            }
        });
        this.events.subscribe('rdNodeData_0', ()=>{
            this.rdNodeData_0();
        });

        this.repIntFormCtrl = new FormControl(
            this.minInt,
            [
                Validators.required,
                Validators.min(this.minInt),
                Validators.max(this.maxInt),
            ]
        );
    }

    /***********************************************************************************************
     * fn          rdNodeData_0
     *
     * brief
     *
     */
    rdNodeData_0() {
        this.rhFlag = !this.rhFlag;
        this.tempFlag = !this.tempFlag;
        this.batVoltFlag = !this.batVoltFlag;
        this.repIntFormCtrl.setValue(this.minInt);

        setTimeout(()=>{
            this.serial.rdNodeData_0();
        }, 200);
    }

    /***********************************************************************************************
     * fn          wrNodeData_0
     *
     * brief
     *
     */
    wrNodeData_0() {

        let buf = new ArrayBuffer(8);
        let data = new DataView(buf);
        let idx = 0;

        data.setUint32(idx, this.globals.HTU21D_005, this.globals.LE);
        idx += 4;
        data.setUint8(idx++, this.rhFlag ? 1 : 0);
        data.setUint8(idx++, this.tempFlag ? 1 : 0);
        data.setUint8(idx++, this.batVoltFlag ? 1 : 0);
        data.setUint8(idx++, this.repIntFormCtrl.value);

        this.serial.wrNodeData_0(buf);
    }

    /***********************************************************************************************
     * fn          repIntErr
     *
     * brief
     *
     */
    repIntErr() {
        if(this.repIntFormCtrl.hasError('required')) {
            return 'You must enter a value';
        }
        if(this.repIntFormCtrl.hasError('min')) {
            return `report interval must be ${this.minInt} - ${this.maxInt}`;
        }
        if(this.repIntFormCtrl.hasError('max')) {
            return `report interval must be ${this.minInt} - ${this.maxInt}`;
        }
    }

    /***********************************************************************************************
     * fn          isInvalid
     *
     * brief
     *
     */
    isInvalid() {
        if(this.repIntFormCtrl.invalid){
            return true;
        }
        return false;
    }
}
