import { Component, OnInit } from '@angular/core';
import { SerialService } from '../serial.service';
import { EventsService } from '../events.service';
import { GlobalsService } from '../globals.service';
import { Validators, FormGroup, FormControl } from '@angular/forms';

@Component({
    selector: 'app-zb-bridge',
    templateUrl: './zb-bridge.component.html',
    styleUrls: ['./zb-bridge.component.scss'],
})
export class ZB_Bridge_Component implements OnInit {
    formGroup: FormGroup;
    minInt = 10;
    maxInt = 60;

    repInterval = this.minInt;

    constructor(private serial: SerialService,
                private events: EventsService,
                private globals: GlobalsService) {
        //---
    }

    ngOnInit(): void {

        this.events.subscribe('rdNodeDataRsp', (msg: Uint8Array)=>{
            let buf = msg.buffer;
            let data = new DataView(buf);
            let idx = 0;

            let partNum = data.getUint32(idx, this.globals.LE);
            idx += 4;
            if(partNum == this.globals.ZB_BRIDGE) {
                this.repInterval = data.getUint8(idx++);
                this.formGroup.patchValue({
                    repInt: this.repInterval,
                });
            }
        });
        this.events.subscribe('rdNodeData_0', ()=>{
            this.rdNodeData_0();
        });

        this.formGroup = new FormGroup({
            repInt: new FormControl(this.repInterval, [
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

        this.repInterval = this.minInt;
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

        let buf = new ArrayBuffer(5);
        let data = new DataView(buf);
        let idx = 0;

        data.setUint32(idx, this.globals.ZB_BRIDGE, this.globals.LE);
        idx += 4;
        this.repInterval = this.formGroup.get('repInt').value;
        data.setUint8(idx++, this.repInterval);

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
            return `rep interval must be ${this.minInt} - ${this.maxInt}`;
        }
        if(this.formGroup.get('repInt').hasError('max')) {
            return `rep interval must be ${this.minInt} - ${this.maxInt}`;
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
        this.repInterval = repInt;
        console.log(`repInt: ${this.repInterval}`);
    }
}
