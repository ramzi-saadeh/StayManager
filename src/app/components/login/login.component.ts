import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../services/auth.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatCardModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        MatSnackBarModule,
        TranslateModule
    ],
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.css']
})
export class LoginComponent {
    loginForm: FormGroup;
    isLoading = signal<boolean>(false);
    hidePassword = signal<boolean>(true);

    constructor(
        private fb: FormBuilder,
        private authService: AuthService,
        private router: Router,
        private snackBar: MatSnackBar,
        private translate: TranslateService
    ) {
        this.loginForm = this.fb.group({
            email: ['', [Validators.required, Validators.email]],
            password: ['', [Validators.required, Validators.minLength(6)]]
        });
    }

    async onSubmit(): Promise<void> {
        if (this.loginForm.valid) {
            this.isLoading.set(true);
            const { email, password } = this.loginForm.value;
            try {
                await this.authService.loginWithEmail(email, password);
                this.router.navigate(['/persons']);
            } catch (error) {
                console.error('Login error:', error);
                this.snackBar.open(this.translate.instant('LOGIN.ERROR'), 'Close', {
                    duration: 4000,
                    horizontalPosition: 'end',
                    verticalPosition: 'top'
                });
            } finally {
                this.isLoading.set(false);
            }
        }
    }
}
