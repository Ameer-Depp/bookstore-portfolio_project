import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRefreshTokenHash1789405260357 implements MigrationInterface {
    name = 'AddRefreshTokenHash1789405260357'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "refreshTokenHash" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "refreshTokenHash"`);
    }

}
