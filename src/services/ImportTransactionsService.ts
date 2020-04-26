import { getRepository, getCustomRepository, In } from 'typeorm';
import fs from 'fs';
import csvParse from 'csv-parse';

import Transaction from '../models/Transaction';
import Category from '../models/Category';
import TransactionRepository from '../repositories/TransactionsRepository';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const transactionRepository = getCustomRepository(TransactionRepository);
    const categoriesRepository = getRepository(Category);
    // Stream que irá ler os arquivos cvs
    const contactsReadStream = fs.createReadStream(filePath);

    // Instanciando a função cvsParse para passar alguns métodos
    const parsers = csvParse({
      from_line: 2,
    });

    // Pipe irá ler as linhas do csv conforme estiver disponível para leitura
    const parseCSV = contactsReadStream.pipe(parsers);

    const transactions: CSVTransaction[] = [];
    const categories: string[] = [];

    // A cada data que for passada irá desestruturar a line e percorrer com map
    // Eliminando os espaços em branco entre a string
    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      // Irá validar se os dados são existentes
      if (!title || !type || !value) return;

      // Mapeando todo o arquivo que está chegando e salvando nas var trans. e cat.
      // E após isso irá salvar tudo de uma única vez no banco de dados
      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    // Gera uma promise para aguardar os resultados serem inseridos
    // Nas constantes categories e transactions
    await new Promise(resolve => parseCSV.on('end', resolve));

    const existentCategories = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    const existentCategoriesTitles = existentCategories.map(
      (category: Category) => category.title,
    );

    const addCategoryTitles = categories
      // Caso não exista a category, irá incluir uma nova
      .filter(category => !existentCategoriesTitles.includes(category))
      // Exibe apenas uma category caso ela esteja duplicada
      .filter((value, index, self) => self.indexOf(value) === index);

    // Irá percorrer cada nova category e salvar ela em formato de objeto
    const newCategories = categoriesRepository.create(
      addCategoryTitles.map(title => ({
        title,
      })),
    );

    await categoriesRepository.save(newCategories);

    const finalCategories = [...newCategories, ...existentCategories];

    const createdTransactions = transactionRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionRepository.save(createdTransactions);

    await fs.promises.unlink(filePath);

    return createdTransactions;
  }
}

export default ImportTransactionsService;
