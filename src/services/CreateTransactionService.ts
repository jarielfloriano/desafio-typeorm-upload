import { getRepository, getCustomRepository } from 'typeorm';

import AppError from '../errors/AppError';
import Transaction from '../models/Transaction';
import Category from '../models/Category';
import TransactionRepository from '../repositories/TransactionsRepository';

interface Request {
  title: string;
  value: number;
  type: 'income' | 'outcome';
  category: string;
}

class CreateTransactionService {
  public async execute({
    title,
    value,
    type,
    category,
  }: Request): Promise<Transaction> {
    const transactionsRepository = getCustomRepository(TransactionRepository);
    const categoriesRepository = getRepository(Category);

    if (!['income', 'outcome'].includes(type)) {
      throw new AppError('Invalid transaction', 400);
    }

    const { total } = await transactionsRepository.getBalance();

    if (total < value && type === 'outcome') {
      throw new AppError('You do not have enough balance', 400);
    }

    let checkCategoryExists = await categoriesRepository.findOne({
      where: {
        title: category,
      },
    });

    if (!checkCategoryExists) {
      checkCategoryExists = categoriesRepository.create({
        title: category,
      });
      await categoriesRepository.save(checkCategoryExists);
    }

    const transaction = transactionsRepository.create({
      title,
      value,
      type,
      category: checkCategoryExists,
    });

    await transactionsRepository.save(transaction);

    return transaction;
  }
}

export default CreateTransactionService;
