import {Component, OnInit} from '@angular/core';
import {SerialService} from '../serial.service';
import {EventsService} from '../events.service';
import {GlobalsService} from '../globals.service';
import {Validators, FormGroup, FormControl} from '@angular/forms';

@Component({
    selector: 'app-actuator-010',
    templateUrl: './actuator-010.component.html',
    styleUrls: ['./actuator-010.component.scss'],
})
export class Actuator_010_Component implements OnInit {
    formGroup: FormGroup;
    minInt = 10;
    maxInt = 60;
    minLevel = 5;
    maxLevel = 95;
    state = false;

    repInterval = this.minInt;
    level = this.minLevel;

    constructor(
        private serial: SerialService,
        private events: EventsService,
        private globals: GlobalsService
    ) {
        //---
    }

    ngOnInit(): void {
        this.events.subscribe('rdNodeDataRsp', (msg: Uint8Array) => {
            let buf = msg.buffer;
            let data = new DataView(buf);
            let idx = 0;

            let partNum = data.getUint32(idx, this.globals.LE);
            idx += 4;
            if (partNum == this.globals.ACTUATOR_010) {
                this.repInterval = data.getUint8(idx++);
                this.state = !!data.getUint8(idx++);
                this.level = data.getUint8(idx);
                this.formGroup.patchValue({
                    repInt: this.repInterval,
                    ltLevel: this.level,
                });
            }
        });
        this.events.subscribe('rdNodeData_0', () => {
            this.rdNodeData_0();
        });

        this.formGroup = new FormGroup({
            repInt: new FormControl(this.repInterval, [
                Validators.required,
                Validators.min(this.minInt),
                Validators.max(this.maxInt),
            ]),
            ltLevel: new FormControl(this.level, [
                Validators.required,
                Validators.min(this.minLevel),
                Validators.max(this.maxLevel),
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
            ltLevel: this.minLevel,
        });
        setTimeout(() => {
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
        let buf = new ArrayBuffer(7);
        let data = new DataView(buf);
        let idx = 0;

        data.setUint32(idx, this.globals.ACTUATOR_010, this.globals.LE);
        idx += 4;
        this.repInterval = this.formGroup.get('repInt').value;
        data.setUint8(idx++, this.repInterval);
        data.setUint8(idx++, this.state ? 1 : 0);
        this.level = this.formGroup.get('ltLevel').value;
        data.setUint8(idx, this.level);

        this.serial.wrNodeData_0(buf);
    }

    /***********************************************************************************************
     * fn          repIntErr
     *
     * brief
     *
     */
    repIntErr() {
        if (this.formGroup.get('repInt').hasError('required')) {
            return 'You must enter a value';
        }
        if (this.formGroup.get('repInt').hasError('min')) {
            return `rep interval must be ${this.minInt} - ${this.maxInt}`;
        }
        if (this.formGroup.get('repInt').hasError('max')) {
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
        console.log('repInt: ' + this.repInterval);
    }

    /***********************************************************************************************
     * fn          levelErr
     *
     * brief
     *
     */
    levelErr() {
        if (this.formGroup.get('ltLevel').hasError('required')) {
            return 'You must enter a value';
        }
        if (this.formGroup.get('ltLevel').hasError('min')) {
            return `light level must be ${this.minLevel} - ${this.maxLevel}`;
        }
        if (this.formGroup.get('ltLevel').hasError('max')) {
            return `light level must be ${this.minLevel} - ${this.maxLevel}`;
        }
    }
    /***********************************************************************************************
     * fn          onLevelChange
     *
     * brief
     *
     */
    onLevelChange(level) {
        // check value and update
        this.level = level;
        console.log('level: ' + this.level);
    }
}
