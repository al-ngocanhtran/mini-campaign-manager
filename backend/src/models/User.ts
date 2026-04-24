import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional } from "sequelize";
import { sequelize } from "../db.js";

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare email: string;
  declare name: string;
  declare password_hash: string;
  declare created_at: CreationOptional<Date>;
}

User.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true, validate: { isEmail: true } },
    name: { type: DataTypes.STRING(255), allowNull: false },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, allowNull: false },
  },
  { sequelize, tableName: "users", timestamps: false }
);
