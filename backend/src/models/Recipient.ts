import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional } from "sequelize";
import { sequelize } from "../db.js";

export class Recipient extends Model<InferAttributes<Recipient>, InferCreationAttributes<Recipient>> {
  declare id: CreationOptional<number>;
  declare email: string;
  declare name: CreationOptional<string | null>;
  declare created_at: CreationOptional<Date>;
}

Recipient.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true, validate: { isEmail: true } },
    name: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, allowNull: false },
  },
  { sequelize, tableName: "recipients", timestamps: false }
);
