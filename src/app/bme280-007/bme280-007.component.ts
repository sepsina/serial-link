import { Component, OnInit, NgZone } from '@angular/core';
import { SerialService } from '../serial.service';
import { EventsService } from '../events.service';
import { GlobalsService } from '../globals.service';
//import {sprintf} from 'sprintf-js';
import { FormControl, FormGroup, Validators } from '@angular/forms';

@Component({
    selector: 'app-bme280-007',
    templateUrl: './bme280-007.component.html',
    styleUrls: ['./bme280-007.component.scss'],
})
export class BME280_007_Component implements OnInit {

    formGroup: FormGroup;
    minInt = 5;
    maxInt = 30;

    rhFlag = false;
    tempFlag = false;
    pressFlag = false;
    batVoltFlag = false;
    reportInterval = this.minInt;

    constructor(private serial: SerialService,
                private events: EventsService,
                private globals: GlobalsService,
                private ngZone: NgZone) {
        //---
    }

    ngOnInit(): void {

        this.events.subscribe('rdNodeDataRsp', (msg: Uint8Array) => {
            let buf = msg.buffer;
            let data = new DataView(buf);
            let idx = 0;

            let partNum = data.getUint32(idx, this.globals.LE);
            idx += 4;
            if(partNum == this.globals.BME280_007) {
                this.ngZone.run(()=>{
                    this.rhFlag = !!data.getUint8(idx++);
                    this.tempFlag = !!data.getUint8(idx++);
                    this.pressFlag = !!data.getUint8(idx++);
                    this.batVoltFlag = !!data.getUint8(idx++);
                    this.reportInterval = data.getUint8(idx++);
                    this.formGroup.patchValue({
                        repInt: this.reportInterval,
                    });
                });
            }
        });
        this.events.subscribe('rdNodeData_0', ()=>{
            this.rdNodeData_0();
        });

        this.formGroup = new FormGroup({
            repInt: new FormControl(this.reportInterval, [
                Validators.required,
                Validators.min(this.minInt),
                Validators.max(this.maxInt),
            ]),
        });
    }

    /***********************************************************************************************
     * fn          rdNodeData_0
     *
     * brief
     *
     */
    rdNodeData_0() {
        this.rhFlag = false;
        this.tempFlag = false;
        this.pressFlag = false;
        this.batVoltFlag = false;
        this.reportInterval = 0;
        this.formGroup.patchValue({
            repInt: this.minInt,
        });
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
        let buf = new ArrayBuffer(9);
        let data = new DataView(buf);
        let idx = 0;

        data.setUint32(idx, this.globals.BME280_007, this.globals.LE);
        idx += 4;
        data.setUint8(idx++, this.rhFlag ? 1 : 0);
        data.setUint8(idx++, this.tempFlag ? 1 : 0);
        data.setUint8(idx++, this.pressFlag ? 1 : 0);
        data.setUint8(idx++, this.batVoltFlag ? 1 : 0);
        this.reportInterval = this.formGroup.get('repInt').value;
        data.setUint8(idx++, this.reportInterval);

        this.serial.wrNodeData_0(buf);
    }
    /***********************************************************************************************
     * fn          repIntErr
     *
     * brief
     *
     */
    repIntErr() {
        if(this.formGroup.get('repInt').hasError('required')) {
            return 'You must enter a value';
        }
        if(this.formGroup.get('repInt').hasError('min')) {
            return `report interval must be ${this.minInt} - ${this.maxInt}`;
        }
        if(this.formGroup.get('repInt').hasError('max')) {
            return `report interval must be ${this.minInt} - ${this.maxInt}`;
        }
    }
    /***********************************************************************************************
     * fn          onRepIntChange
     *
     * brief
     *
     */
    onRepIntChange(repInt) {
        // check value and update
        this.reportInterval = repInt;
        console.log(`repInt: ${this.reportInterval}`);
    }
}
