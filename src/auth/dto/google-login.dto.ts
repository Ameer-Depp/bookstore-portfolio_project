import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096) // JWTs from Google are <2KB; 4KB is generous headroom
  idToken: string;
}
