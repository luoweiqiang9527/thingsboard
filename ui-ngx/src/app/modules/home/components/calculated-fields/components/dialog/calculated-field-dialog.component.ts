///
/// Copyright © 2016-2025 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

import { Component, DestroyRef, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { AppState } from '@core/core.state';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { DialogComponent } from '@shared/components/dialog.component';
import {
  CalculatedField,
  CalculatedFieldConfiguration,
  CalculatedFieldDialogData,
  CalculatedFieldType,
  CalculatedFieldTypeTranslations,
  getCalculatedFieldArgumentsEditorCompleter,
  getCalculatedFieldArgumentsHighlights,
  OutputType,
  OutputTypeTranslations
} from '@shared/models/calculated-field.models';
import { noLeadTrailSpacesRegex } from '@shared/models/regex.constants';
import { AttributeScope } from '@shared/models/telemetry/telemetry.models';
import { EntityType } from '@shared/models/entity-type.models';
import { map, startWith, switchMap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ScriptLanguage } from '@shared/models/rule-node.models';
import { CalculatedFieldsService } from '@core/http/calculated-fields.service';

@Component({
  selector: 'tb-calculated-field-dialog',
  templateUrl: './calculated-field-dialog.component.html',
  styleUrls: ['./calculated-field-dialog.component.scss'],
})
export class CalculatedFieldDialogComponent extends DialogComponent<CalculatedFieldDialogComponent, CalculatedField> {

  fieldFormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.pattern(noLeadTrailSpacesRegex), Validators.maxLength(255)]],
    type: [CalculatedFieldType.SIMPLE],
    debugSettings: [],
    configuration: this.fb.group({
      arguments: this.fb.control({}),
      expressionSIMPLE: ['', [Validators.required, Validators.pattern(noLeadTrailSpacesRegex), Validators.maxLength(255)]],
      expressionSCRIPT: [],
      output: this.fb.group({
        name: ['', [Validators.required, Validators.pattern(noLeadTrailSpacesRegex), Validators.maxLength(255)]],
        scope: [{ value: AttributeScope.SERVER_SCOPE, disabled: true }],
        type: [OutputType.Timeseries]
      }),
    }),
  });

  functionArgs$ = this.configFormGroup.get('arguments').valueChanges
    .pipe(
      startWith(this.data.value?.configuration?.arguments ?? {}),
      map(argumentsObj => Object.keys(argumentsObj))
    );

  argumentsEditorCompleter$ = this.configFormGroup.get('arguments').valueChanges
    .pipe(
      startWith(this.data.value?.configuration?.arguments ?? {}),
      map(argumentsObj => getCalculatedFieldArgumentsEditorCompleter(argumentsObj))
    );

  argumentsHighlightRules$ = this.configFormGroup.get('arguments').valueChanges
    .pipe(
      startWith(this.data.value?.configuration?.arguments ?? {}),
      map(argumentsObj => getCalculatedFieldArgumentsHighlights(argumentsObj))
    );

  additionalDebugActionConfig = this.data.value?.id ? {
    ...this.data.additionalDebugActionConfig,
    action: () => this.data.additionalDebugActionConfig.action({ id: this.data.value.id, ...this.fromGroupValue }),
  } : null;

  readonly OutputTypeTranslations = OutputTypeTranslations;
  readonly OutputType = OutputType;
  readonly AttributeScope = AttributeScope;
  readonly EntityType = EntityType;
  readonly CalculatedFieldType = CalculatedFieldType;
  readonly ScriptLanguage = ScriptLanguage;
  readonly fieldTypes = Object.values(CalculatedFieldType) as CalculatedFieldType[];
  readonly outputTypes = Object.values(OutputType) as OutputType[];
  readonly CalculatedFieldTypeTranslations = CalculatedFieldTypeTranslations;

  constructor(protected store: Store<AppState>,
              protected router: Router,
              @Inject(MAT_DIALOG_DATA) public data: CalculatedFieldDialogData,
              protected dialogRef: MatDialogRef<CalculatedFieldDialogComponent, CalculatedField>,
              private calculatedFieldsService: CalculatedFieldsService,
              private destroyRef: DestroyRef,
              private fb: FormBuilder) {
    super(store, router, dialogRef);
    this.observeIsLoading();
    this.applyDialogData();
    this.observeTypeChanges();
  }

  get configFormGroup(): FormGroup {
    return this.fieldFormGroup.get('configuration') as FormGroup;
  }

  get outputFormGroup(): FormGroup {
    return this.fieldFormGroup.get('configuration').get('output') as FormGroup;
  }

  get fromGroupValue(): CalculatedField {
    const { configuration, type, ...rest } = this.fieldFormGroup.value;
    const { expressionSIMPLE, expressionSCRIPT, ...restConfig } = configuration;
    return { configuration: { ...restConfig, type, expression: configuration['expression'+type] }, ...rest, type } as CalculatedField;
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  add(): void {
    if (this.fieldFormGroup.valid) {
      this.calculatedFieldsService.saveCalculatedField({ entityId: this.data.entityId, ...(this.data.value ?? {}),  ...this.fromGroupValue})
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(calculatedField => this.dialogRef.close(calculatedField));
    }
  }

  onTestScript(): void {
    const calculatedFieldId = this.data.value?.id?.id;

    (calculatedFieldId
      ? this.calculatedFieldsService.getLatestCalculatedFieldDebugEvent(calculatedFieldId)
        .pipe(
          switchMap(event => {
            const args = event?.arguments ? JSON.parse(event.arguments) : null;
            return this.data.getTestScriptDialogFn(this.fromGroupValue, args, false);
          }),
          takeUntilDestroyed(this.destroyRef)
        )
      : this.data.getTestScriptDialogFn(this.fromGroupValue, null, false))
      .subscribe(expression => {
        this.configFormGroup.get('expressionSCRIPT').setValue(expression);
        this.configFormGroup.get('expressionSCRIPT').markAsDirty();
      });
  }

  private applyDialogData(): void {
    const { configuration = {}, type = CalculatedFieldType.SIMPLE, debugSettings = { failuresEnabled: true, allEnabled: true }, ...value } = this.data.value ?? {};
    const { expression, ...restConfig } = configuration as CalculatedFieldConfiguration;
    const updatedConfig = { ...restConfig , ['expression'+type]: expression };
    this.fieldFormGroup.patchValue({ configuration: updatedConfig, type, debugSettings, ...value }, {emitEvent: false});
  }

  private observeTypeChanges(): void {
    this.toggleKeyByCalculatedFieldType(this.fieldFormGroup.get('type').value);
    this.toggleScopeByOutputType(this.outputFormGroup.get('type').value);

    this.outputFormGroup.get('type').valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(type => this.toggleScopeByOutputType(type));
    this.fieldFormGroup.get('type').valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(type => this.toggleKeyByCalculatedFieldType(type));
  }

  private toggleScopeByOutputType(type: OutputType): void {
    this.outputFormGroup.get('scope')[type === OutputType.Attribute? 'enable' : 'disable']({emitEvent: false});
  }

  private toggleKeyByCalculatedFieldType(type: CalculatedFieldType): void {
    if (type === CalculatedFieldType.SIMPLE) {
      this.outputFormGroup.get('name').enable({emitEvent: false});
      this.configFormGroup.get('expressionSIMPLE').enable({emitEvent: false});
      this.configFormGroup.get('expressionSCRIPT').disable({emitEvent: false});
    } else {
      this.outputFormGroup.get('name').disable({emitEvent: false});
      this.configFormGroup.get('expressionSIMPLE').disable({emitEvent: false});
      this.configFormGroup.get('expressionSCRIPT').enable({emitEvent: false});
    }
  }

  private observeIsLoading(): void {
    this.isLoading$.pipe(takeUntilDestroyed()).subscribe(loading => {
      if (loading) {
        this.fieldFormGroup.disable({emitEvent: false});
      } else {
        this.fieldFormGroup.enable({emitEvent: false});
        this.toggleScopeByOutputType(this.outputFormGroup.get('type').value);
        this.toggleKeyByCalculatedFieldType(this.fieldFormGroup.get('type').value);
        if (this.data.isDirty) {
          this.fieldFormGroup.markAsDirty();
        }
      }
    });
  }
}
